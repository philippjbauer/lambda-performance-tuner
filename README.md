lambda-performance-tuner
========================

**[ ! ] This project is still very much WIP! Tuning functionality not yet available.**

Automatically determines the best cost / performance balance for an AWS Lambda function.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/lambda-performance-tuner.svg)](https://npmjs.org/package/lambda-performance-tuner)
[![Downloads/week](https://img.shields.io/npm/dw/lambda-performance-tuner.svg)](https://npmjs.org/package/lambda-performance-tuner)
[![License](https://img.shields.io/npm/l/lambda-performance-tuner.svg)](https://github.com/philippjbauer/lambda-performance-tuner/blob/master/package.json)

<!-- toc -->
# Why this tool?

As per Amazon's **Serverless Architectures with AWS Lambda** whitepaper*, there's a point of diminishing returns when dialing up the memory size of a Lambda function. At a certain point, the time it takes to execute the function does not get faster but the price to run the function goes up. This tool is aimed to automatically determine the optimal Lambda function memory size to run as fast as possible without spending more than necessary for the function execution.

*[Download Whitepaper](https://d1.awsstatic.com/whitepapers/serverless-architectures-with-aws-lambda.pdf), see page 27 and following.



# Setup

Log in to your AWS account and create a new policy with the following configuration, call it **LambdaPerformanceTunerAccess**.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "LambdaPerformanceTuner",
            "Effect": "Allow",
            "Action": [
                "lambda:ListFunctions",
                "lambda:InvokeFunction",
                "lambda:UpdateFunctionConfiguration",
                "lambda:GetFunctionConfiguration"
            ],
            "Resource": "*"
        }
    ]
}
```

Create a user with **Programmatic access** called **LambdaPerformanceTuner** and attach the policy to the user. Take note of both the **access key ID** and **secret access key**.

Add a new profile **lambdatuner** (or name of your choosing) to your `~/.aws/credentials` file like in the example below. You can use the `-p "my-profile"` option to switch between profiles.

```ini
# ~/.aws/credentials
[lambdatuner]
aws_access_key_id=AKIA***********LSGNX
aws_secret_access_key=fJSuPKDx************************UxSwILfW
```

Add a new profile **lambdatuner** (or name of your choosing) to your `~/.aws/config` file like in the example below.

```ini
# ~/.aws/config
[lambdatuner]
region=us-east-1
output=json
```

You can run `npm link` in this directory to install the CLI globally and get access to the CLI command `lamda-tuner`!

# Usage
<!-- usage -->

To run execute `./bin/run` or `lambda-tuner` in your command line. To get help execute `./bin/run -h` or `lambda-tuner -h`.

### Help Output

The current help output with current and planned options.

```bash
➜ lambda-tuner -h
Automatically determines the best cost / performance balance for an AWS Lambda function.

USAGE
  $ lambda-tuner

OPTIONS
  -M, --max=max          [default: 1024] Maximum amount of RAM to test for Lambda function.
  -h, --help             show CLI help
  -l, --list             List all available Lambda functions.
  -m, --min=min          [default: 128] Minimum amount of RAM to test for Lambda function.
  -p, --profile=profile  [default: lambdatuner] Local profile of the AWS user to use.
  -r, --region=region    [default: us-east-1] AWS region your Lambda function lives in.
  -v, --version          show CLI version
```