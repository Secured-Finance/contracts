import { BigNumber } from 'ethers';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';

import { getWaitConfirmations } from '../utils/deployment';

const PLUGIN_NAME = 'SecuredFinance';
const V3_PROTOCOL = 0;
const V4_PROTOCOL = 1;
const MAX_UINT24 = 2 ** 24 - 1;

const fail = (message: string): never => {
  throw new HardhatPluginError(PLUGIN_NAME, message);
};

task(
  'set-liquidation-swap-route',
  'Register a single-hop V3 or V4 route for liquidation swaps',
)
  .addParam('tokenIn', 'Input token address', undefined, types.string)
  .addParam('tokenOut', 'Output token address', undefined, types.string)
  .addParam('protocol', 'Swap protocol: V3 or V4', undefined, types.string)
  .addParam('fee', 'Pool fee', undefined, types.int)
  .addOptionalParam('tickSpacing', 'V4 pool tick spacing', 0, types.int)
  .addOptionalParam(
    'hooks',
    'V4 pool hooks address',
    '0x0000000000000000000000000000000000000000',
    types.string,
  )
  .addOptionalParam('hookData', 'V4 hook data', '0x', types.string)
  .setAction(
    async (
      { tokenIn, tokenOut, protocol, fee, tickSpacing, hooks, hookData },
      { deployments, ethers, getNamedAccounts },
    ) => {
      if (!ethers.utils.isAddress(tokenIn)) {
        fail(`Invalid input token address: ${tokenIn}`);
      }
      if (!ethers.utils.isAddress(tokenOut)) {
        fail(`Invalid output token address: ${tokenOut}`);
      }
      if (!ethers.utils.isAddress(hooks)) {
        fail(`Invalid hooks address: ${hooks}`);
      }
      if (!ethers.utils.isHexString(hookData)) {
        fail(`Invalid hook data: ${hookData}`);
      }

      const normalizedTokenIn = ethers.utils.getAddress(tokenIn);
      const normalizedTokenOut = ethers.utils.getAddress(tokenOut);
      const normalizedHooks = ethers.utils.getAddress(hooks);
      if (
        normalizedTokenIn === ethers.constants.AddressZero ||
        normalizedTokenOut === ethers.constants.AddressZero ||
        normalizedTokenIn === normalizedTokenOut
      ) {
        fail('Token addresses must be non-zero and different');
      }

      const normalizedProtocol = protocol.toUpperCase();
      if (normalizedProtocol !== 'V3' && normalizedProtocol !== 'V4') {
        fail(`Unsupported protocol: ${protocol}`);
      }
      if (fee < 0 || fee > MAX_UINT24) {
        fail(`Pool fee must be between 0 and ${MAX_UINT24}`);
      }

      const protocolValue =
        normalizedProtocol === 'V4' ? V4_PROTOCOL : V3_PROTOCOL;
      if (protocolValue === V3_PROTOCOL) {
        if (fee === 0) {
          fail('V3 pool fee must be greater than zero');
        }
        if (
          tickSpacing !== 0 ||
          normalizedHooks !== ethers.constants.AddressZero ||
          hookData !== '0x'
        ) {
          fail('tickSpacing, hooks, and hookData are only supported for V4');
        }
      } else if (tickSpacing <= 0) {
        fail('V4 tick spacing must be greater than zero');
      }

      const { deployer } = await getNamedAccounts();
      const signer = await ethers.getSigner(deployer);
      const executorDeployment = await deployments.get(
        'UniswapUniversalRouterExecutor',
      );
      const liquidatorDeployment = await deployments.get('Liquidator');
      const executor = await ethers.getContractAt(
        'UniswapUniversalRouterExecutor',
        executorDeployment.address,
      );
      const liquidator = await ethers.getContractAt(
        'Liquidator',
        liquidatorDeployment.address,
      );
      const step = {
        protocol: protocolValue,
        tokenOut: normalizedTokenOut,
        fee,
        tickSpacing: protocolValue === V4_PROTOCOL ? tickSpacing : 0,
        hooks:
          protocolValue === V4_PROTOCOL
            ? normalizedHooks
            : ethers.constants.AddressZero,
        hookData: protocolValue === V4_PROTOCOL ? hookData : '0x',
      };

      const currentRoute = await executor.getRoute(
        normalizedTokenIn,
        normalizedTokenOut,
      );
      const currentStep = currentRoute[0];
      const routeIsCurrent =
        currentRoute.length === 1 &&
        BigNumber.from(currentStep.protocol).eq(step.protocol) &&
        currentStep.tokenOut.toLowerCase() === step.tokenOut.toLowerCase() &&
        BigNumber.from(currentStep.fee).eq(step.fee) &&
        BigNumber.from(currentStep.tickSpacing).eq(step.tickSpacing) &&
        currentStep.hooks.toLowerCase() === step.hooks.toLowerCase() &&
        currentStep.hookData.toLowerCase() === step.hookData.toLowerCase();
      const currentExecutor = await liquidator.swapExecutors(
        normalizedTokenIn,
        normalizedTokenOut,
      );
      const executorIsCurrent =
        currentExecutor.toLowerCase() ===
        executorDeployment.address.toLowerCase();
      const waitConfirmations = getWaitConfirmations();

      if (!routeIsCurrent) {
        const executorOwner = await executor.owner();
        if (executorOwner.toLowerCase() !== deployer.toLowerCase()) {
          fail(
            `Swap executor owner ${executorOwner} does not match deployer ${deployer}`,
          );
        }
      }
      if (!executorIsCurrent) {
        const liquidatorOwner = await liquidator.owner();
        if (liquidatorOwner.toLowerCase() !== deployer.toLowerCase()) {
          fail(
            `Liquidator owner ${liquidatorOwner} does not match deployer ${deployer}`,
          );
        }
      }

      if (!routeIsCurrent) {
        await executor
          .connect(signer)
          .setRoute(normalizedTokenIn, normalizedTokenOut, [step])
          .then((tx) => tx.wait(waitConfirmations));
        console.log(
          `Registered ${normalizedProtocol} route ${normalizedTokenIn}/${normalizedTokenOut}`,
        );
      } else {
        console.warn(
          `Skipped unchanged route ${normalizedTokenIn}/${normalizedTokenOut}`,
        );
      }

      if (executorIsCurrent) {
        console.warn(
          `Skipped unchanged executor ${normalizedTokenIn}/${normalizedTokenOut}`,
        );
        return;
      }

      await liquidator
        .connect(signer)
        .setSwapExecutor(
          normalizedTokenIn,
          normalizedTokenOut,
          executorDeployment.address,
        )
        .then((tx) => tx.wait(waitConfirmations));
      console.log(
        `Registered swap executor ${normalizedTokenIn}/${normalizedTokenOut}`,
      );
    },
  );
