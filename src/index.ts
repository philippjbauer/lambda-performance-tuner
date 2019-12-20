import {Command, flags} from '@oclif/command'
import * as AWS from 'aws-sdk'
import Cli from 'cli-ux'
import Chalk from 'chalk'
import Inquirer, {Answers} from 'inquirer'

const iniLoader: AWS.IniLoader = new AWS.IniLoader()

class LambdaPerformanceTuner extends Command {
  static description = 'Automatically determines the best cost / performance balance for an AWS Lambda function.'

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    region: flags.string({char: 'r', description: 'AWS region your Lambda function lives in.'}),
    profile: flags.string({char: 'p', default: 'lambdatuner', description: 'Local profile of the AWS user to use.'}),
    list: flags.boolean({char: 'l', description: 'List all available Lambda functions.'}),
    'min-memory': flags.integer({char: 'm', default: 128, description: Chalk`Minimum memorySize to test for Lambda function. {bold (Minimum: 128)}`}),
    'max-memory': flags.integer({char: 'M', default: 2084, description: Chalk`Maximum memorySize to test for Lambda function. {bold (Maximum: 3008)}`}),
    'max-price': flags.integer({char: 'P', description: 'Maximum price you\'re willing to spend per 1,000,000 executions/month.'}),
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
    const functions: FunctionInformation[] = await this.listFunctions()

    Cli.log('\n')
    Cli.table(functions, {
      memorySize: {
        header: 'Memory',
        get: row => Chalk`{${this.getMemoryColor(row.memorySize)}.bold ${row.memorySize.toString().padStart(4, ' ')}MB}`,
      },
      functionName: {header: 'Name'},
      functionArn: {header: 'ARN'},
      state: {header: 'State'},
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
    const functions: FunctionInformation[] = await this.listFunctions()

    // Ask user to select functions
    Cli.flush()
    const functionSelection: Answers = await this.promptFunctionSelection(functions)

    // Ask user for event test data for each function
    const functionEvents: FunctionEvent[] = await Promise.all(
      functionSelection.functions.map(
        (func: FunctionInformation): Promise<FunctionEvent> => this.promptFunctionEvent(func)
      )
    )
    console.log(functionEvents)

    // Create tuning algorithm and process all selected functions ...

    // Ask for an event input for each selected Lambda function
    // Then run the following instructions asynchroneously for each function
    // Do measurement: Invoke the function 10 times, save the execution IDs, we need them for CloudWatch Logs
    // Retrieve CloudWatch Logs and parse execution time, price and max memory used
    // Adjust memory size one size (64MB) upwards.
    // Do measurement again, repeat if faster / cheaper, return to previous if faster / more expensive
  }

  async promptFunctionSelection(functions: FunctionInformation[]): Promise<Answers> {
    return Inquirer.prompt({
      type: 'checkbox',
      name: 'functions',
      message: 'Please select a Lambda to tune:',
      choices: functions.map((func: FunctionInformation) => {
        const functionName: string = func.functionName.length > 80 ?
          `${func.functionName.substr(0, 79)}…` :
          func.functionName

        const name: string = Chalk`{${this.getMemoryColor(func.memorySize)}.bold ${func.memorySize.toString().padStart(4, ' ')}MB} ${functionName}`
        const value: FunctionInformation = func

        return {name, value}
      }),
    })
  }

  async promptFunctionEvent(func: FunctionInformation): Promise<FunctionEvent> {
    const eventSource: string = await this.promptFunctionEventSource()

    let eventData: {} = {}

    if (eventSource === 'input') {
      eventData = await this.promptFunctionEventFile(func)
    } else {
      eventData = await this.promptFunctionEventEditor(func)
    }

    return {
      functionArn: func.functionArn,
      data: eventData,
    } as FunctionEvent
  }

  async promptFunctionEventSource(): Promise<string> {
    const eventSourceSelection: Answers = await Inquirer.prompt({
      type: 'list',
      name: 'eventSource',
      message: 'Do you want to load a file or open your default editor for a one-off event input?',
      choices: [
        {name: 'Load a file', value: 'input'},
        {name: 'Open default editor', value: 'editor'},
      ],
      default: 0,
    })

    return eventSourceSelection.eventSource
  }

  async promptFunctionEventFile(func: FunctionInformation): Promise<any> {
    const input: Answers = await Inquirer.prompt({
      type: 'input',
      name: 'path',
      message: `Please select a JSON file for ${func.functionName}`,
    })

    // Load from path

    return {key: 'value'}
  }

  async promptFunctionEventEditor(func: FunctionInformation): Promise<any> {
    const input: Answers = await Inquirer.prompt({
      type: 'editor',
      name: 'json',
      message: `Please enter a valid JSON string for ${func.functionName}`,
    })

    try {
      const json = JSON.parse(input.json)
      return json
    } catch (error) {
      this.customError(error)
    }
  }

  /**
   * List Lambda Functions
   *
   * Uses AWS Lambda Service to retrieve the current user's
   * Lambda functions and returns their relevant information
   * we use to display to the user in the CLI.
   *
   * @returns {Promise<FunctionInformation[]>}
   * @memberof LambdaPerformanceTuner
   */
  async listFunctions(): Promise<FunctionInformation[]> {
    let functions: FunctionInformation[] = []

    Cli.action.start('Retrieving your Lambda functions.')

    const listFunctionsResponse: (AWS.Lambda.ListFunctionsResponse | undefined) =
      await this.lambda?.listFunctions().promise()

    if (!listFunctionsResponse?.Functions) {
      throw new Error('Functions undefined in Lambda\'s ListFunctionsResponse.')
    }

    functions = listFunctionsResponse.Functions.map(
      (func: AWS.Lambda.FunctionConfiguration): FunctionInformation => {
        return {
          functionArn: func.FunctionArn,
          functionName: func.FunctionName,
          description: func.Description,
          memorySize: func.MemorySize,
          runtime: func.Runtime,
          state: func.State || 'Unknown',
        } as FunctionInformation
      }
    )

    if (functions.length === 0) {
      throw new Error('No AWS Lambda functions found in this region.')
    }

    Cli.action.stop(Chalk`{green.bold ${functions.length} function(s) found. }`)

    return functions
  }

  /**
   * AWS Setup
   *
   * Create the necessary environment for the CLI to run.
   *
   * @param {string} profile
   * @param {string} region
   * @memberof LambdaPerformanceTuner
   */
  awsSetup(profile: string, region: (string | undefined)): void {
    const credentials = iniLoader.loadFrom({})
    const config = iniLoader.loadFrom({isConfig: true})
    const ini = Object.assign({}, credentials[profile], config[profile])

    // Configure Lambda Service
    this.lambda = new AWS.Lambda({
      apiVersion: '2015-03-31',
      accessKeyId: ini.aws_access_key_id,
      secretAccessKey: ini.aws_secret_access_key,
      region: region || ini.region,
    })

    Cli.log(Chalk`Using AWS Region: {green.bold ${this.lambda.config.region}}`)
  }

  /**
   * Custom Error Handler
   *
   * Display a nicer error than the default oclif error at `this.error`.
   *
   * @param {(string | Error)} input
   * @param {{}} [options]
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
    Cli.exit(options?.exit)
  }

  /**
   * Get a Chalk color for memory size
   *
   * @param {number} size Lambda memorySize
   * @returns {string}
   * @memberof LambdaPerformanceTuner
   */
  getMemoryColor(size: number): string {
    return size > 2048 ?
      'red' :
      size > 1024 ?
        'yellow' :
        'green'
  }
}

interface FunctionInformation {
  functionArn: string;
  functionName: string;
  description?: string;
  memorySize: number;
  runtime: string;
  state: string;
}

interface FunctionEvent {
  functionArn: string;
  data?: {};
}

export = LambdaPerformanceTuner
