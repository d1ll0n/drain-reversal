import { BigNumber } from "@ethersproject/bignumber";
import {
  Result as AbiCoderResult,
  FunctionFragment,
  Interface,
  ParamType,
} from "@ethersproject/abi";
import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { chunk } from "lodash";
import { constants } from "ethers";
import { IMulticall } from "../../typechain"
import { getContract } from "./chain";

const CHUNK_CALL_COUNT = 150;
export const MULTICALL2_ADDRESS = '0x5ba1e12693dc8f9c48aad8770482f4739beed696'

const hasNumber = (str: string) => /\d/.test(str);

function getDefaultForBaseType(baseType: string) {
  if (baseType.includes("uint")) return BigNumber.from(0);
  if (baseType.includes("int")) return BigNumber.from(0);
  if (baseType.includes("string")) return "";
  if (baseType.includes("bytes")) {
    if (hasNumber(baseType)) {
      const num = +baseType.slice(5);
      return "0x".padEnd((num + 1) * 2, "00");
    }
    return "0x";
  }
  if (baseType === "bool") return false;
}

function getDefaultForParamType(param: ParamType): any {
  if (param.components?.length) {
    return param.components.map(getDefaultForParamType);
  }
  const baseValue = getDefaultForBaseType(param.baseType);
  if (param.arrayLength) {
    return new Array(param.arrayLength).fill(baseValue);
  }
  return baseValue;
}

function getDefaultResultForFunction(fn: FunctionFragment): any[] {
  const { outputs } = fn;
  if (!outputs) return [];
  return outputs.map((t) => getDefaultForParamType(t));
}

interface CondensedCall {
  target: string;
  callData: string;
  interface: Interface;
}

function condenseCalls(
  _calls: Call[],
  _interface?: Interface
): CondensedCall[] {
  return _calls.reduce((prev, next) => {
    const {
      target,
      function: callFunction,
      args,
      interface: interface_
    } = next;
    if (!interface_) {
      throw new Error(`Interface not provided for call`);
    }
    const callData = interface_.encodeFunctionData(callFunction, args);
    prev.push({ callData, interface: interface_, target });
    return prev;
  }, [] as CondensedCall[]);
}

async function executeChunk(
  _provider: JsonRpcProvider | JsonRpcSigner,
  _calls: CondensedCall[],
  blockTag?: number,
  _strict?: boolean
): Promise<string[]> {
  try {
    const multicallContract: IMulticall = await getContract(MULTICALL2_ADDRESS, 'IMulticall')
    const returnData =
      await multicallContract.callStatic.tryAggregate(
        false,
        _calls.map((c) => ({ target: c.target ? c.target : constants.AddressZero, callData: c.callData })),
        { blockTag }
      );
    const decodedResult = returnData.map((r) =>
      r.success ? r.returnData : "0x"
    );
    return decodedResult;
  } catch (err) {
    console.log("Got mC err");
    console.log(err);
    throw err;
  }
}

export type Call = {
  target: string;
  interface: Interface
  function: string;
  args?: any[] | undefined;
}

export async function multicall(
  _provider: JsonRpcProvider | JsonRpcSigner,
  _calls: Call[],
  _interface?: Interface,
  blockTag?: number,
  _strict?: boolean
): Promise<AbiCoderResult> {
  const calls = condenseCalls(_calls, _interface);
  const chunks = chunk(calls, CHUNK_CALL_COUNT);
  const allResults: string[][] = await Promise.all(
    chunks.map((chunk) => executeChunk(_provider, chunk, blockTag, _strict))
  );
  const decodedResult = allResults.reduce(
    (prev, next) => [...prev, ...next],
    [] as string[]
  );
  const formattedResults = (decodedResult as string[]).map((result, index) => {
    return (result === "0x"
      ? getDefaultResultForFunction(
          calls[index].interface.getFunction((_calls[index] as Call).function)
        )
      : calls[index].interface.decodeFunctionResult(
          (_calls[index] as Call).function,
          result
        ))[0];
  });

  return formattedResults;
}