import { Contract } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  executeIfNewlyDeployment,
  getWaitConfirmations,
} from '../utils/deployment';

interface AdapterDeployment {
  name: string;
  tokenIn: string;
  args: string[];
}

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy, execute } = deployments;
  const { deployer } = await getNamedAccounts();
  const waitConfirmations = getWaitConfirmations();

  const liquidator: Contract = await deployments
    .get('Liquidator')
    .then(({ address }) => ethers.getContractAt('Liquidator', address));
  const wrappedNativeToken = await liquidator.nativeToken();
  const adapters: AdapterDeployment[] = [];

  if (process.env.GLIF_POOL_ADDRESS && process.env.IFIL_ADDRESS) {
    adapters.push({
      name: 'GlifIFILAdapter',
      tokenIn: process.env.IFIL_ADDRESS,
      args: [
        process.env.GLIF_POOL_ADDRESS,
        process.env.IFIL_ADDRESS,
        wrappedNativeToken,
      ],
    });
  }

  if (
    process.env.PARASAIL_POOL_ADDRESS &&
    process.env.WPFIL_ADDRESS &&
    process.env.PFIL_ADDRESS
  ) {
    adapters.push({
      name: 'ParasailWPFILAdapter',
      tokenIn: process.env.WPFIL_ADDRESS,
      args: [
        process.env.PARASAIL_POOL_ADDRESS,
        process.env.WPFIL_ADDRESS,
        process.env.PFIL_ADDRESS,
        wrappedNativeToken,
      ],
    });
  }

  const liquidatorOwner = await liquidator.owner();

  if (liquidatorOwner.toLowerCase() !== deployer.toLowerCase()) {
    throw new Error(
      `Liquidator owner ${liquidatorOwner} does not match deployer ${deployer}; register adapters through the owner`,
    );
  }

  for (const adapter of adapters) {
    const deployResult = await deploy(adapter.name, {
      from: deployer,
      args: adapter.args,
      waitConfirmations,
    });

    await executeIfNewlyDeployment(adapter.name, deployResult);

    const currentAdapter = await liquidator.conversionAdapters(adapter.tokenIn);

    if (currentAdapter.toLowerCase() === deployResult.address.toLowerCase()) {
      console.warn(`Skipped registering ${adapter.name}`);
      continue;
    }

    await execute(
      'Liquidator',
      { from: deployer, waitConfirmations },
      'setConversionAdapter',
      adapter.tokenIn,
      deployResult.address,
    );

    console.log(
      `Registered ${adapter.name} for ${adapter.tokenIn} on Liquidator`,
    );
  }
};

func.tags = ['LiquidationAdaptersFVM'];
func.dependencies = ['Liquidator'];
func.skip = async () =>
  process.env.ENABLE_AUTO_UPDATE !== 'true' ||
  !(
    (process.env.GLIF_POOL_ADDRESS && process.env.IFIL_ADDRESS) ||
    (process.env.PARASAIL_POOL_ADDRESS &&
      process.env.WPFIL_ADDRESS &&
      process.env.PFIL_ADDRESS)
  );
func.runAtTheEnd = true;
export default func;
