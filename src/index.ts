import { Command, flags } from '@oclif/command'
import * as AWS from 'aws-sdk'
import Cli from 'cli-ux'
import Chalk from 'chalk'
import Inquirer, { Answers } from 'inquirer'

const iniLoader: AWS.IniLoader = new AWS.IniLoader()

class LambdaPerformanceTuner extends Command {
  static description = 'Automatically determines the best cost / performance balance for an AWS Lambda function.'

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    region: flags.string({char: 'r', default: 'us-east-1', description: 'AWS region your Lambda function lives in.'}),
    profile: flags.string({char: 'p', default: 'lambdatuner', description: 'Local profile of the AWS user to use.'}),
    list: flags.boolean({char: 'l', description: 'List all available Lambda functions.'}),
    'min-memory': flags.integer({char: 'm', default: 128, description: 'Minimum amount of memory to test for Lambda function.'}),
    'max-memory': flags.integer({char: 'M', default: 1024, description: 'Maximum amount of memory to test for Lambda function.'}),
    'max-price': flags.integer({char: 'P', description: 'Maximum price you\'re willing to spend per 1,000,000 executions/month.'})
  }

  lambda: (AWS.Lambda | undefined)

  async run() {
    const {args, flags} = this.parse(LambdaPerformanceTuner)

    try {
      this.awsSetup(flags.profile, flags.region)

      // Run List CLI Option
      if (flags.list) {
        await this.runList()
        return
      }

      await this.runTuner()
    } catch (error) {
      this.customError(error)
    }
  }

  /**
   * Run List CLI Option
   * 
   * Retrieves the Lambda functions of the set region
   * and displays them in the CLI.
   * 
   * @returns {Promise<void>}
   * @memberof LambdaPerformanceTuner
   */
  async runList(): Promise<void> {
    const functions: LambdaFunctionInformation[] = await this.listFunctions()

    Cli.log(`\n`)
    Cli.table(functions, {
      functionName: {header: 'Name'},
      memorySize: {
        header: 'Memory',
        get: (row) => Chalk`{${this.getMemoryColor(row.memorySize)}.bold ${row.memorySize}MB}`
      },
      state: {header: 'State'}
    })
  }

  /**
   * Run Tuning CLI Option
   * 
   * Asks the user which functions to tune and processes
   * the selected functions with the help tuning of our
   * tuning algorithm.
   *
   * @returns {Promise<void>}
   * @memberof LambdaPerformanceTuner
   */
  async runTuner(): Promise<void> {
    const functions: LambdaFunctionInformation[] = await this.listFunctions()

    Cli.log(`\n`)
    const answers: Answers = await Inquirer.prompt({
        type: 'checkbox',
        name: 'functions',
        message: 'Please select a Lambda to tune:',
        choices: functions.map((func: LambdaFunctionInformation) => {
          const functionName: string = func.functionName.length > 80
            ? `${func.functionName.substr(0, 79)}…`
            : func.functionName
          
          const name: string = Chalk`{${this.getMemoryColor(func.memorySize)}.bold ${func.memorySize.toString().padStart(4, ' ')}MB} ${functionName}`
          const value: string = func.functionName
          
          return {name, value}
        })
      })
    
    console.log(answers)
    
    // Create tuning algorithm and process all selected functions
  }

  /**
   * List Lambda Functions
   * 
   * Uses AWS Lambda Service to retrieve the current user's
   * Lambda functions and returns their relevant information
   * we use to display to the user in the CLI.
   *
   * @returns {Promise<LambdaFunctionInformation[]>}
   * @memberof LambdaPerformanceTuner
   */
  async listFunctions(): Promise<LambdaFunctionInformation[]> {
    let functions: LambdaFunctionInformation[] = []

    Cli.action.start(`Retrieving your Lambda functions.`)
    
    const listFunctionsResponse : AWS.Lambda.ListFunctionsResponse | undefined = 
      await this.lambda?.listFunctions().promise()
    
    if (!listFunctionsResponse?.Functions) {
      throw new Error(`Functions undefined in Lambda's ListFunctionsResponse.`);
    }
    
    functions = listFunctionsResponse.Functions.map((func) => {
      return {
        functionName: func.FunctionName,
        description: func.Description,
        memorySize: func.MemorySize,
        runtime: func.Runtime,
        state: func.State || 'Unknown'
      } as LambdaFunctionInformation
    })
    
    if (functions.length === 0) {
      throw new Error(`No AWS Lambda functions found in this region.`)
    }

    Cli.action.stop(Chalk`{green.bold ${functions.length} function(s) found. }`)

    return functions
  }

  /**
   * AWS Setup
   * 
   * Create the necessary environment for the CLI to run.
   *
   * @param {string} [profile='lambdatuner']
   * @param {string} [region='us-east-1']
   * @memberof LambdaPerformanceTuner
   */
  awsSetup(profile: string = 'lambdatuner', region: string = 'us-east-1'): void {
    const credentials = iniLoader.loadFrom({})
    const config = iniLoader.loadFrom({isConfig: true})
    const ini = Object.assign({}, credentials[profile], config[profile]);

    // Configure Lambda Service
    this.lambda = new AWS.Lambda({
      apiVersion: '2015-03-31',
      accessKeyId: ini.aws_access_key_id,
      secretAccessKey: ini.aws_secret_access_key,
      region: ini.region
    })
    
    Cli.log(Chalk`Using AWS Region: {green.bold ${this.lambda.config.region}}`)
  }

  /**
   * Custom Error Handler
   * 
   * Display a nicer error than the default oclif error at `this.error`.
   *
   * @param {(string | Error)} input
   * @param {{
   *       code?: string;
   *       exit?: number;
   *   }} [options]
   * @returns {never}
   * @memberof LambdaPerformanceTuner
   */
  customError(input: string | Error, options?: {
      code?: string;
      exit?: number;
  }): never {
    const name = input instanceof Error ? input.name : 'Error'
    const message = input instanceof Error ? input.message : input
    const code = options?.code ? ` {bgRed.white ${options.code}}` : ''

    Cli.log(Chalk`{red.bold ${name}${code}:} {red ${message}}`)
    Cli.exit(options?.exit);
  };

  getMemoryColor(size: number): string {
    return size > 2048
      ? 'red'
      : size > 1024
        ? 'yellow'
        : 'green'
  }
}

interface LambdaFunctionInformation {
  functionName: string
  description?: string
  memorySize: number
  runtime: string
  state: string
}

interface LambdaFunctionSettings {
  memorySize: number
}

export = LambdaPerformanceTuner
