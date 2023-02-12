/* eslint-disable require-atomic-updates */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-await-in-loop */
import { randomUUID } from "crypto";

import {
  GetFunctionCommand,
  InvokeCommand,
  LambdaClient,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { BatchGetTracesCommand, XRayClient } from "@aws-sdk/client-xray";
import { program } from "commander";
import ora from "ora";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fmt = (x: string | number, w: number) =>
  `                                                                ${x}`.slice(
    -w
  );

type Document = {
  origin: string;
  start_time: number;
  end_time: number;
  subsegments: { name: string; start_time: number; end_time: number }[];
};

type Data = {
  xrayTraceId: string;
  lambda: {
    startTime: number;
    endTime: number;
  };
  initialization: {
    startTime: number;
    endTime: number;
  };
  invocation: {
    startTime: number;
    endTime: number;
  };
  overhead: {
    startTime: number;
    endTime: number;
  };
};

const xray = new XRayClient({});
const lambda = new LambdaClient({});
const spinner = ora();

const test = async (functionName: string): Promise<Data> => {
  spinner.start();
  spinner.text = "updating the function...";
  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Environment: {
        Variables: {
          VERSION: randomUUID(),
        },
      },
    })
  );

  let status = undefined;
  spinner.text = "waiting for the function to be ready...";
  do {
    await sleep(500);
    const res = await lambda.send(
      new GetFunctionCommand({
        FunctionName: functionName,
      })
    );
    status = res.Configuration?.LastUpdateStatus;
  } while (status === "InProgress");

  spinner.text = "execute the function...";
  const invokeRes = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      LogType: "Tail",
    })
  );
  if (invokeRes.LogResult === undefined) {
    throw new Error("LogResult must be defined.");
  }
  const logResult = Buffer.from(invokeRes.LogResult, "base64").toString();

  const xrayTraceId = /XRAY TraceId: ([\w-]+)/.exec(logResult)?.[1];
  if (xrayTraceId === undefined) {
    throw new Error("TraceId was not found.");
  }

  spinner.text = "retrieving X-Ray trace...";
  let xrayTrace = undefined;
  do {
    await sleep(500);
    const xrayRes = await xray.send(
      new BatchGetTracesCommand({
        TraceIds: [xrayTraceId],
      })
    );
    xrayTrace = xrayRes.Traces?.[0];
  } while (xrayTrace === undefined || xrayTrace.Segments?.length !== 2);

  const data = xrayTrace.Segments?.map(
    (it) => JSON.parse(it.Document ?? "") as Document
  );

  const lambdaData = data.find((it) => it.origin === "AWS::Lambda");
  if (lambdaData === undefined) {
    throw new Error("AWS::Lambda was not found.");
  }

  const functionData = data.find((it) => it.origin === "AWS::Lambda::Function");
  if (functionData === undefined) {
    throw new Error("AWS::Lambda::Function was not found.");
  }

  const initializationData = functionData.subsegments.find(
    (it) => it.name === "Initialization"
  );
  if (initializationData === undefined) {
    throw new Error("Initialization was not found.");
  }

  const invocationData = functionData.subsegments.find(
    (it) => it.name === "Invocation"
  );
  if (invocationData === undefined) {
    throw new Error("Invocation was not found.");
  }

  const overheadData = functionData.subsegments.find(
    (it) => it.name === "Overhead"
  );
  if (overheadData === undefined) {
    throw new Error("Overhead was not found.");
  }

  const getOffset = (t: number) =>
    Math.round((t - lambdaData.start_time) * 1000);

  spinner.stop();

  return {
    xrayTraceId,
    lambda: {
      startTime: getOffset(lambdaData.start_time),
      endTime: getOffset(lambdaData.end_time),
    },
    initialization: {
      startTime: getOffset(initializationData.start_time),
      endTime: getOffset(initializationData.end_time),
    },
    invocation: {
      startTime: getOffset(invocationData.start_time),
      endTime: getOffset(invocationData.end_time),
    },
    overhead: {
      startTime: getOffset(overheadData.start_time),
      endTime: getOffset(overheadData.end_time),
    },
  };
};

const main = async () => {
  program
    .option("-t, --times <times>", "number of samples", "3")
    .argument("<function-name>")
    .parse();

  const [functionName] = program.args;
  if (functionName === undefined) {
    throw new Error("never reach here.");
  }

  const options = program.opts();
  const times = Number(options["times"]);

  console.log(
    [
      fmt("XRAY TRACE ID", 35),
      fmt("PRE[ms]", 12),
      fmt("INIT[ms]", 12),
      fmt("INV[ms]", 12),
      fmt("TOTAL[ms]", 12),
    ].join("")
  );

  let pre = 0;
  let init = 0;
  let inv = 0;
  let total = 0;
  for (let i = 1; i <= times; i++) {
    const data = await test(functionName);

    const durations = {
      total: data.lambda.endTime - data.lambda.startTime,
      preInitialization: data.initialization.startTime,
      initialization:
        data.initialization.endTime - data.initialization.startTime,
      initializationToInvocation:
        data.invocation.startTime - data.initialization.endTime,
      invocation: data.invocation.endTime - data.invocation.startTime,
      invocationToOverhead: data.overhead.endTime - data.invocation.startTime,
      overhead: data.overhead.endTime - data.overhead.startTime,
      postOverhead: data.lambda.endTime - data.overhead.endTime,
    };

    pre += durations.preInitialization;
    init += durations.initialization;
    inv += durations.invocation;
    total += durations.total;

    console.log(
      [
        fmt(data.xrayTraceId, 35),
        fmt(durations.preInitialization, 12),
        fmt(durations.initialization, 12),
        fmt(durations.invocation, 12),
        fmt(durations.total, 12),
      ].join("")
    );
  }

  console.log(
    [
      fmt("AVERAGE", 35),
      fmt(Math.round(pre / times), 12),
      fmt(Math.round(init / times), 12),
      fmt(Math.round(inv / times), 12),
      fmt(Math.round(total / times), 12),
    ].join("")
  );
};
void main();
