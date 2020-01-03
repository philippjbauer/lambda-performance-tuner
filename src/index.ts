import {Command, flags} from '@oclif/command'
import * as AWS from 'aws-sdk'
import Cli from 'cli-ux'
import Chalk from 'chalk'
import {Answers} from 'inquirer'
import CustomError from './custom-error'
import Prompt, {PromptHelpers} from './prompt'
import FunctionEvent from './interfaces/function-event'
import FunctionInformation from './interfaces/function-information'

const iniLoader: AWS.IniLoader = new AWS.IniLoader()
const prompt = new Prompt()

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
      CustomError.throw(error)
    }
  }

  /**
   * Run List CLI Option
   *
   * Retrieves the Lambda functions of the set region
   * and displays them in the CLI.
   *
   * @returns {Promise<void>} Void
   * @memberof LambdaPerformanceTuner
   */
  async runList(): Promise<void> {
    const functions: FunctionInformation[] = await this.listFunctions()

    Cli.log('\n')
    Cli.table(functions, {
      memorySize: {
        header: 'Memory',
        get: row => Chalk`{${PromptHelpers.getMemoryColor(row.memorySize)}.bold ${row.memorySize.toString().padStart(4, ' ')}MB}`,
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
   * @returns {Promise<void>} Void
   * @memberof LambdaPerformanceTuner
   */
  async runTuner(): Promise<void> {
    const functions: FunctionInformation[] = await this.listFunctions()

    // Ask user to select functions
    Cli.flush()
    const functionSelection: Answers = await prompt.functionSelection(functions)

    // Ask user for event test data for each function
    const functionEvents: FunctionEvent[] = await functionSelection.functions.map(
      async (func: FunctionInformation): Promise<FunctionEvent> => prompt.functionEvent(func)
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

  /**
   * List Lambda Functions
   *
   * Uses AWS Lambda Service to retrieve the current user's
   * Lambda functions and returns their relevant information
   * we use to display to the user in the CLI.
   *
   * @returns {Promise<FunctionInformation[]>} Function Array
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
   * @param {string} profile AWS Profile
   * @param {string} region AWS Region
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
}

export = LambdaPerformanceTuner
