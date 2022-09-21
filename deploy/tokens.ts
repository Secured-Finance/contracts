import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencies } from '../utils/currencies';
import { executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}: HardhatRuntimeEnvironment) {
  const log = {};
  const logHeader = 'Contract Addresses';
  for (const currency of currencies) {
    if (currency.env) {
      console.log(`${currency.symbol} uses the existing address`);
      log[currency.symbol] = { [logHeader]: currency.env };
      continue;
    }

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const deployResult = await deploy(currency.mock, {
      from: deployer,
      args: currency.args,
    });
    log[currency.symbol] = { [logHeader]: deployResult.address };
    await executeIfNewlyDeployment(currency.mock, deployResult);
  }

  console.table(log);
};

func.tags = ['Tokens'];

export default func;
