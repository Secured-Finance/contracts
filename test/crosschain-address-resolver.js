const { should } = require('chai');
const { ethers } = require('hardhat');
const { reverted } = require('../test-utils').assert;
const utils = require('web3-utils');
const expectRevert = reverted;

should();

contract('CrossChainAddressResolver test', async (accounts) => {
    let crosschainResolver;
    const [owner, alice, bob, carol] = accounts;

    before('deploy CrossChainAddressResolver', async () => {
        const crosschainResolverFactory = await ethers.getContractFactory('CrosschainAddressResolver');
        crosschainResolver = await crosschainResolverFactory.deploy(owner);
        await crosschainResolver.deployed();
    });

    describe('Test cross chain address registration', () => {
        it('Test registering BTC address for user', async () => {
            let btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';

            await crosschainResolver.functions['updateAddress(uint256,string)'](0, btcAddress);

            let address = await crosschainResolver.getUserAddress(owner, 0);
            address.should.be.equal(btcAddress);
        });

        it('Test registering FIL address for user', async () => {
            let filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

            await crosschainResolver.functions['updateAddress(uint256,string)'](461, filAddress);

            let address = await crosschainResolver.getUserAddress(owner, 461);
            address.should.be.equal(filAddress);
        });

        it('Test registering FIL shortened miner address for user', async () => {
            let filMinerAddress = 'f01188117';

            await crosschainResolver.functions['updateAddress(uint256,string)'](461, filMinerAddress);

            let address = await crosschainResolver.getUserAddress(owner, 461);
            address.should.be.equal(filMinerAddress);
        });

        it('Test registering BTC segwit address for user', async () => {
            let btcSegwitAddress = 'bc1q2qlsskv7ewf4uz674qcsllaw060jf69ctcymtx';

            await crosschainResolver.functions['updateAddress(uint256,string)'](0, btcSegwitAddress);

            let address = await crosschainResolver.getUserAddress(owner, 0);
            address.should.be.equal(btcSegwitAddress);
        });

        it('Test registering BTC and FIL addresses for user', async () => {
            let btcAddress = '3QTN7wR2EpVeGbjBcHwQdAjJ1QyAqws5Qt';
            let filAddress = 'f2ujkdpilen762ktpwksq3vfmre4dpekpgaplcvty';

            await crosschainResolver.updateAddresses(owner, [0, 461], [btcAddress, filAddress]);

            let address = await crosschainResolver.getUserAddress(owner, 0);
            address.should.be.equal(btcAddress);

            address = await crosschainResolver.getUserAddress(owner, 461);
            address.should.be.equal(filAddress);
        });

    });

});