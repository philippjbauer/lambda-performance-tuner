import Cli from 'cli-ux'
import Chalk from 'chalk'

class CustomError {
  /**
   * Custom Error Handler
   *
   * Display a nicer error than the default oclif error at `this.error`.
   *
   * @param {(string | Error)} input Error message
   * @param {{}} [options] Options
   * @memberof LambdaPerformanceTuner
   */
  public throw(input: (string | Error), options?: {
    code?: string;
    exit?: number;
  }): never {
    const name = input instanceof Error ? input.name : 'Error'
    const message = input instanceof Error ? input.message : input
    const code = options?.code ? ` {bgRed.white ${options.code}}` : ''

    Cli.log(Chalk`{red.bold ${name}${code}:} {red ${message}}`)
    Cli.exit(options?.exit)
  }
}

export default new CustomError()
