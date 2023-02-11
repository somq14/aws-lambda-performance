import * as cdk from "aws-cdk-lib";

import { AppStack } from "./app-stack";

const app = new cdk.App();
new AppStack(app, "aws-lambda-performance", {});
