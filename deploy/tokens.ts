import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencies, executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  for (const currency of currencies) {
    if (currency.env) {
      console.log(`${currency.symbol} address is ${currency.env}`);
      continue;
    }

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const deployResult = await deploy(currency.mock, {
      from: deployer,
      args: currency.args,
    });
    await executeIfNewlyDeployment(currency.mock, deployResult);
  }
};

func.tags = ['Tokens'];

export default func;
