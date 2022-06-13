require('dotenv/config');

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, getNetworkName } = deployments;
  const { deployer } = await getNamedAccounts();
  const network = getNetworkName();

  let linkTokenAddress;
  switch (network) {
    case 'hardhat': {
      const linkToken = await deploy('LinkToken', { from: deployer });
      linkTokenAddress = linkToken.address;
      console.log('Deployed LinkToken at ' + linkToken.address);
      break;
    }
    case 'rinkeby': {
      linkTokenAddress = '0x01BE23585060835E02B77ef475b0Cc51aA1e0709';
      break;
    }
    case 'mainnet': {
      linkTokenAddress = '0x0000000000000000000000000000000000000000';
      break;
    }
    default: {
      linkTokenAddress = process.env.LINK_CONTRACT_ADDRESS;
      break;
    }
  }

  console.log('LinkToken Address is ' + linkTokenAddress);

  const oracle = await deploy('Operator', {
    from: deployer,
    args: [linkTokenAddress, deployer],
  });

  console.log('Deployed Oracle at ' + oracle.address);

  const oracleContract = await ethers.getContractAt('Operator', oracle.address);

  await oracleContract
    .setAuthorizedSenders([process.env.CHAINLINK_NODE_ACCOUNT])
    .then((tx) => tx.wait());
};

module.exports.tags = ['ChainlinkOracle'];
