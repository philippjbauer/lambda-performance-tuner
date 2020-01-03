export default interface FunctionInformation {
  functionArn: string;
  functionName: string;
  description?: string;
  memorySize: number;
  runtime: string;
  state: string;
}
