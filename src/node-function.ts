import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export type NodeFunctionProps = Omit<
  lambda.FunctionProps,
  "runtime" | "handler"
> & {
  runtime?: lambda.FunctionProps["runtime"];
  handler?: lambda.FunctionProps["handler"];
};

export class NodeFunction extends lambda.Function {
  constructor(scope: Construct, id: string, props: NodeFunctionProps) {
    super(scope, id, {
      ...props,
      runtime: props.runtime ?? lambda.Runtime.NODEJS_18_X,
      handler: props.handler ?? "index.handler",
      memorySize: 1769 ?? props.memorySize,
      tracing: props.tracing ?? lambda.Tracing.ACTIVE,
    });
  }
}
