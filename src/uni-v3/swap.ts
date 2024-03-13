import { BigNumberish, Contract, Wallet, ethers } from "ethers";
import erc20Abi from "../abis/common/ERC20.json";
import swapRouterAbi from "../abis/uniswap/SwapRouter.json";
import routerAbi from "../abis/infra/Router.json";
import quoterAbi from "../abis/uniswap/Quoter.json";
import { PROTOCOLS, INFRA, NATIVETOKENS } from "../constants";
import { BigNumber } from "bignumber.js";
import { findPoolAndFee } from "./utils/getPoolFee";
import { quotePair } from "./utils/quote";
import env from "dotenv";
import { parseUnits } from "ethers/lib/utils";

env.config();

function getAdjAmount(_amount: string, _decimals: number) {
  let _adjAmount: ethers.BigNumber;

  if (_decimals == 18) {
    _adjAmount = parseUnits(_amount, 18);
  } else if (_decimals == 6) {
    _adjAmount = parseUnits(_amount, 6);
  } else if (_decimals == 8) {
    _adjAmount = parseUnits(_amount, 8);
  }

  return _adjAmount;
}

export async function buildSwap(
  wallet: Wallet,
  address: string,
  token0: string,
  token1: string,
  reverse: boolean,
  protocol: string,
  chainId: string,
  amount: string,
  slippage: number
) {
  console.log("BUILD SWAP");

  const quoter = String(PROTOCOLS[chainId][protocol].QUOTER);
  const uniRouter = String(PROTOCOLS[chainId][protocol].ROUTER);
  const swapRouterContract = new Contract(uniRouter, swapRouterAbi, wallet);
  const infraRouter = String(INFRA[chainId].ROUTER);
  const InfraRouterContract = new Contract(infraRouter, routerAbi, wallet);
  const agentAddress = await InfraRouterContract.getAgentAddress(address);
  const tokenAAddress = reverse == true ? token1 : token0;
  const tokenBAddress = reverse == true ? token0 : token1;
  const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);
  const tokenADecimals = await tokenAContract.decimals();
  // const tokenBContract = new Contract(tokenBAddress, erc20Abi, provider);
  // const tokenBDecimals = await tokenBContract.decimals();

  const gasLimit: Number = 30000000;
  const gasPrice: BigNumberish = await wallet.provider.getGasPrice();
  const gas: BigNumberish = gasPrice;

  let Approvals = [];
  let Calldatas = [];

  let adjAmount: any = ethers.BigNumber.from(0);

  console.log("::API:: TOKEN_DECIMAL ", Number(tokenADecimals));

  if (tokenADecimals == 0) {
    throw new Error("Invalid Token Decimals");
  }

  adjAmount = getAdjAmount(amount, tokenADecimals) as BigNumberish;

  console.log("::API:: AMOUNT ", Number(amount));
  console.log("::API:: ADJ_AMOUNT ", Number(adjAmount));

  if (adjAmount == 0) {
    throw new Error("Invalid Token Decimals");
  }

  const quoterContract = new Contract(quoter, quoterAbi, wallet);
  const quote = await quotePair(tokenAAddress, tokenBAddress, Number(chainId));
  const allowanceAgent: BigNumber = await tokenAContract?.allowance(
    address,
    agentAddress
  );
  const allowanceAgentToRouter: BigNumber = await tokenAContract?.allowance(
    agentAddress,
    uniRouter
  );
  const slippageTolerance = slippage;

  console.log("::API:: ALLOWANCE_AGENT_SENDER_AMOUNT", Number(allowanceAgent));
  console.log(
    "::API:: ALLOWANCE_AGENT_UNIROUTER_AMOUNT",
    Number(allowanceAgentToRouter)
  );
  console.log("::API:: ROUTER_ADDRESS", infraRouter);
  console.log("::API:: UNI_ROUTER_ADDRESS", uniRouter);
  console.log("::API:: AGENT_ADDRESS", agentAddress);

  // Allowance for Sender to Agent
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  if (allowanceAgent.lt(adjAmount)) {
    console.log("::API:: AGENT_NO_ALLOWANCE_SENDER");

    const dataApproveToAgent = tokenAContract.interface.encodeFunctionData(
      "approve",
      [agentAddress, ethers.constants.MaxUint256]
    );

    const approvalToAgent = {
      to: tokenAAddress,
      value: 0,
      data: dataApproveToAgent,
    };

    Approvals.push(approvalToAgent);
  } else {
    console.log("::API:: AGENT_ALLOWANCE_SENDER_OK");
  }

  // Allowance for Agent to Univ3
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  if (allowanceAgentToRouter.lt(adjAmount)) {
    console.log("::API:: AGENT_NO_ALLOWANCE_UNIROUTER");

    const calldataApproveAgentToRouter =
      tokenAContract.interface.encodeFunctionData("approve", [
        uniRouter,
        ethers.constants.MaxUint256,
      ]);

    const approvalAgentToRouter = {
      to: tokenAAddress,
      value: 0,
      data: calldataApproveAgentToRouter,
    };

    Calldatas.push(approvalAgentToRouter);
  } else {
    console.log("::API:: AGENT_ALLOWANCE_UNIROUTER_OK");
  }

  // Transfer tokens from Sender to Agent
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------
  const dataTransferFromSenderToAgent =
    tokenAContract.interface.encodeFunctionData("transferFrom", [
      address,
      agentAddress,
      adjAmount,
    ]);

  const transferFromSenderToAgent = {
    to: tokenAAddress,
    value: 0,
    data: dataTransferFromSenderToAgent,
  };

  if (transferFromSenderToAgent) console.log("::API:: TRANSFER_FROM_CALLDATA");

  Calldatas.push(transferFromSenderToAgent);

  // Encode Swap tx to Uni Router
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------

  if (!quote) {
    console.error("❌ USDC_POOL_NOT_FOUND");
    console.log("↩️ ENCODE_WMATIC_ROUTE");

    const poolFee = await findPoolAndFee(
      quoterContract,
      tokenAAddress,
      NATIVETOKENS[chainId].WRAPPED,
      adjAmount,
      slippageTolerance
    );

    const expectedAmountB: BigNumber =
      await quoterContract?.callStatic?.quoteExactInputSingle?.(
        tokenAAddress,
        NATIVETOKENS[chainId].WRAPPED,
        poolFee,
        adjAmount,
        0
      );

    const poolFee2 = await findPoolAndFee(
      quoterContract,
      NATIVETOKENS[chainId].WRAPPED,
      tokenBAddress,
      expectedAmountB as any,
      slippageTolerance
    );

    let swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);

    const path = ethers.utils.solidityPack(
      ["address", "uint24", "address", "uint24", "address"],
      [
        tokenAAddress,
        poolFee,
        NATIVETOKENS[chainId].WRAPPED,
        poolFee2,
        tokenBAddress,
      ]
    );

    let swapTxInputs = [path, agentAddress, swapDeadline, adjAmount, 0];

    console.log("::API:: EXACT_INPUT");
    const calldataSwapAgentToRouter =
      swapRouterContract.interface.encodeFunctionData("exactInput", [
        swapTxInputs,
      ]);

    const swapMultiAgentToRouter = {
      to: PROTOCOLS[chainId][protocol].ROUTER as string,
      value: 0,
      data: calldataSwapAgentToRouter,
    };

    Calldatas.push(swapMultiAgentToRouter);
  } else {
    const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);

    const poolFee = await findPoolAndFee(
      quoterContract,
      tokenAAddress,
      tokenBAddress,
      adjAmount,
      slippageTolerance
    );

    const expectedAmountB: BigNumber =
      await quoterContract?.callStatic?.quoteExactInputSingle?.(
        tokenAAddress,
        tokenBAddress,
        poolFee,
        adjAmount,
        0
      );

    const minimumAmountB = ethers.BigNumber.from(expectedAmountB)
      .mul(10000 - slippageTolerance)
      .div(10000);

    const swapTxInputs = [
      tokenAAddress,
      tokenBAddress,
      poolFee,
      agentAddress!,
      swapDeadline,
      adjAmount,
      minimumAmountB,
      0,
    ];

    console.log("::API:: EXACT_INPUT_SINGLE");

    const calldataSwapAgentToRouter =
      swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
        swapTxInputs,
      ]);

    const swapAgentToRouter = {
      to: uniRouter,
      value: 0,
      data: calldataSwapAgentToRouter,
    };

    Calldatas.push(swapAgentToRouter);
  }

  const TokensReturn = [tokenBAddress];

  console.log("::API:: Approvals", Approvals);
  console.log("::API:: Calldatas", Calldatas);
  console.log("::API:: TokensReturn", TokensReturn);

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
}
