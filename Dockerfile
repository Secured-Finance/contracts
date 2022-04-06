FROM mhart/alpine-node:14

RUN apk update && apk add --no-cache --virtual build-dependencies git g++ make
RUN wget https://github.com/ethereum/solidity/releases/download/v0.6.12/solc-static-linux -O /bin/solc && chmod +x /bin/solc

RUN mkdir -p /secured-finance-protocol
WORKDIR /secured-finance-protocol

ADD ./package.json /secured-finance-protocol
ADD ./yarn.lock /secured-finance-protocol
RUN yarn install --lock-file

ADD . /secured-finance-protocol

RUN npx hardhat compile

RUN yarn run deploy:hardhat

# RUN npx hardhat node