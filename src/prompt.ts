import Chalk from 'chalk'
import Inquirer, {Answers} from 'inquirer'
import FunctionEvent from './interfaces/function-event'
import FunctionInformation from './interfaces/function-information'
import CustomError from './custom-error'

export class PromptHelpers {
  /**
   * Get a Chalk color for memory size
   *
   * @param {number} size Lambda memorySize
   * @returns {string} Color to display memorySize in
   * @memberof LambdaPerformanceTuner
   */
  public static getMemoryColor(size: number): string {
    return size > 2048 ?
      'red' :
      size > 1024 ?
        'yellow' :
        'green'
  }
}

export default class Prompt {
  async functionSelection(functions: FunctionInformation[]): Promise<Answers> {
    let selection: Answers = {}

    selection = await Inquirer.prompt({
      type: 'checkbox',
      name: 'functions',
      message: 'Please select a Lambda to tune:',
      choices: functions.map((func: FunctionInformation) => {
        const functionName: string = func.functionName.length > 80 ?
          `${func.functionName.substr(0, 79)}…` :
          func.functionName

        const name: string = Chalk`{${PromptHelpers.getMemoryColor(func.memorySize)}.bold ${func.memorySize.toString().padStart(4, ' ')}MB} ${functionName}`
        const value: FunctionInformation = func

        return {name, value}
      }),
    })

    return selection
  }

  async functionEvent(func: FunctionInformation): Promise<FunctionEvent> {
    const eventSource: string = await this.functionEventSource()

    let eventData: {} = {}

    if (eventSource === 'input') {
      eventData = await this.functionEventFile(func)
    } else {
      eventData = await this.functionEventEditor(func)
    }

    return {
      functionArn: func.functionArn,
      data: eventData,
    } as FunctionEvent
  }

  private async functionEventSource(): Promise<string> {
    let selection: Answers = {}

    selection = await Inquirer.prompt({
      type: 'list',
      name: 'eventSource',
      message: 'Do you want to load a file or open your default editor for a one-off event input?',
      choices: [
        {name: 'Load a file', value: 'input'},
        {name: 'Open default editor', value: 'editor'},
      ],
      default: 0,
    })

    return selection.eventSource
  }

  private async functionEventFile(func: FunctionInformation): Promise<Record<string, any>> {
    let json: Record<string, any> = {}

    const input: Answers = await Inquirer.prompt({
      type: 'input',
      name: 'path',
      message: `Please select a JSON file for ${func.functionName}`,
    })

    // Load from path
    const file: string = JSON.stringify({foo: 'bar'})

    try {
      json = JSON.parse(file)
    } catch (error) {
      CustomError.throw(error)
    }

    return json
  }

  private async functionEventEditor(func: FunctionInformation): Promise<Record<string, any>> {
    let json: Record<string, any> = {}

    const input: Answers = await Inquirer.prompt({
      type: 'editor',
      name: 'json',
      message: `Please enter a valid JSON string for ${func.functionName}`,
    })

    try {
      json = JSON.parse(input.json)
    } catch (error) {
      CustomError.throw(error)
    }

    return json
  }
}
