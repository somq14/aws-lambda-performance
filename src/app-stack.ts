import path from "path";

import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

import { NodeFunction } from "./node-function";

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new NodeFunction(this, "ZipFunction", {
      code: lambda.Code.fromAsset(path.resolve(__dirname, "zip-function")),
    });

    new NodeFunction(this, "DockerFunction", {
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromAssetImage(
        path.resolve(__dirname, "docker-function")
      ),
    });

    new NodeFunction(this, "FatAssetFunction", {
      code: lambda.Code.fromAsset(
        path.resolve(__dirname, "fat-asset-function")
      ),
    });
  }
}
