require('dotenv/config');
const { BigNumber } = require('ethers');

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
  const tx1 = await oracleContract.setAuthorizedSenders([
    process.env.CHAINLINK_NODE_ACCOUNT,
  ]);
  await tx1.wait();

  const chainlinkSettlementAdaptor = await deploy(
    'ChainlinkSettlementAdaptor',
    {
      from: deployer,
      args: [
        oracle.address,
        process.env.CHAINLINK_JOB_ID,
        process.env.CHAINLINK_REQUEST_FEE,
        linkTokenAddress,
      ],
    },
  );
  console.log(
    'Deployed ChainlinkSettlementAdaptor at ' +
      chainlinkSettlementAdaptor.address,
  );

  if (network === 'hardhat') {
    const linkContract = await ethers.getContractAt(
      'LinkToken',
      linkTokenAddress,
    );
    const tx2 = await linkContract.transfer(
      chainlinkSettlementAdaptor.address,
      BigNumber.from('100000000000000000000'),
    );
    await tx2.wait();
    console.log('Sent 100 LINK to ' + chainlinkSettlementAdaptor.address);
  }
};

module.exports.tags = ['ChainlinkSettlementAdaptor'];
module.exports.dependencies = ['SettlementEngine'];
