FROM mhart/alpine-node:16

RUN apk update && apk add --no-cache --virtual build-dependencies git g++ make python2
RUN wget https://github.com/ethereum/solidity/releases/download/v0.6.12/solc-static-linux -O /bin/solc && chmod +x /bin/solc

RUN mkdir -p /secured-finance-protocol
WORKDIR /secured-finance-protocol

ADD ./package.json /secured-finance-protocol
ADD ./package-lock.json /secured-finance-protocol
RUN npm install

ADD . /secured-finance-protocol

RUN npx hardhat compile

RUN npm run deploy:hardhat

# RUN npx hardhat node