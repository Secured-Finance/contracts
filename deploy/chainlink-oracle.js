require('dotenv/config');
const { executeIfNewlyDeployment } = require('../test-utils').deployment;

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, getNetworkName } = deployments;
  const { deployer } = await getNamedAccounts();
  const network = getNetworkName();

  let linkTokenAddress;
  switch (network) {
    case 'rinkeby': {
      linkTokenAddress = '0x01BE23585060835E02B77ef475b0Cc51aA1e0709';
      break;
    }
    case 'mainnet': {
      linkTokenAddress = '0x0000000000000000000000000000000000000000';
      break;
    }
    default: {
      const linkTokenDeployResult = await deploy('LinkToken', {
        from: deployer,
      });
      linkTokenAddress = linkTokenDeployResult.address;
      break;
    }
  }

  console.log('LinkToken Address is ' + linkTokenAddress);

  const deployResult = await deploy('Operator', {
    from: deployer,
    args: [linkTokenAddress, deployer],
  });

  const oracleContract = await ethers.getContractAt(
    'Operator',
    deployResult.address,
  );
  const senders = await oracleContract.getAuthorizedSenders();

  await executeIfNewlyDeployment('Oracle', deployResult);

  if (senders[0] != process.env.CHAINLINK_NODE_ACCOUNT) {
    await oracleContract
      .setAuthorizedSenders([process.env.CHAINLINK_NODE_ACCOUNT])
      .then((tx) => tx.wait());

    console.log(
      'Updated the autorized sender of Oracle at',
      process.env.CHAINLINK_NODE_ACCOUNT,
    );
  }
};

module.exports.tags = ['ChainlinkOracle'];
