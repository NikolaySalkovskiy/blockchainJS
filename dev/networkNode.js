const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Blockchain = require('./blockchain');

const nodeAddress = uuidv4().split("-").join("");

const salkovsky = new Blockchain();

const port = process.argv[2];
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/blockchain', (req, res) => {
    res.send(salkovsky);
})

app.post('/transaction', (req, res) => {
    const newTransaction = req.body["newTransaction"];
    const blockIndex = salkovsky.addTransactionToPendingTransactions(newTransaction);
    res.json({
        note: `Transaction will be added in block ${blockIndex}`
    });
})

app.post("/transaction/broadcast", (req, res) => {
    const newTransaction = salkovsky.createNewTransaction(Number(req.body.amount), req.body.sender, req.body.recipient);
    salkovsky.addTransactionToPendingTransactions(newTransaction);
    let requestPromises = [];

    salkovsky.networkNodes.forEach(networkNodeURL => {
        const reqOptions = {
            method: "post",
            url: networkNodeURL + '/transaction',
            data: {
                newTransaction
            }
        };
        requestPromises.push(axios(reqOptions));
    });

    Promise.all(requestPromises)
        .then(data => {
            res.json({
                note: 'Transaction created and broadcasted successfully'
            });
        });
})

app.get('/mine', (req, res) => {
    const lastBlock = salkovsky.getLastBlock();
    const previousBlockHash = lastBlock['hash'];

    const currentBlockData = {
        transactions: salkovsky.pendingTransactions,
        index: lastBlock['index'] + 1
    };

    const nonce = salkovsky.proofOfWork(previousBlockHash, currentBlockData);
    const blockhash = salkovsky.hashBlock(previousBlockHash, currentBlockData, nonce);
    const newBlock = salkovsky.createNewBlock(nonce, previousBlockHash, blockhash);

    let requestPromises = [];
    salkovsky.networkNodes.forEach(networkNodeURL => {
        const requestOptions = {
            method: "post",
            url: networkNodeURL + "/recieve-new-block",
            data: {
                newBlock: newBlock
            }
        };
        requestPromises.push(axios(requestOptions));
    })

    Promise.all(requestPromises)
        .then(data => {
            const requestOptions = {
                method: "post",
                url: salkovsky.currentNodeURL + '/transaction/broadcast',
                data: {
                    amount: 12.5,
                    sender: "00",
                    recipient: nodeAddress
                }
            };

            return axios(requestOptions);
        })
        .then(data => {
            res.json({
                note: 'New block mined successfully and broadcasted',
                block: newBlock
            });
        })      
});

app.post('/recieve-new-block', (req, res) => {
    const newBlock = req.body.newBlock;
    const lastBlock = salkovsky.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

    if (correctHash && correctIndex) {
        salkovsky.chain.push(newBlock)
        salkovsky.pendingTransactions = [];
        res.json({
            note: 'New block recieved and accepted',
            newBlock: newBlock
        });
    } else {
        res.json({
            note: "New block rejected",
            newBlock: newBlock
        })
    }
})

app.post('/register-and-broadcast-node', (req, res) => {
    const newNodeURL = req.body.newNodeURL;
    if (salkovsky.networkNodes.indexOf(newNodeURL) == -1) salkovsky.networkNodes.push(newNodeURL);

    let regNodesPromises = [];
    salkovsky.networkNodes.forEach(networkNodeURL => {
        const requestOptions = {
            method: "post",
            url: networkNodeURL + "/register-node",
            data: {
                newNodeURL: newNodeURL
            }
        }
        regNodesPromises.push(axios(requestOptions));
    });

    Promise.all(regNodesPromises)
        .then(data => {
            const bulkRegisterOptions = {
                method: "post",
                url: newNodeURL + '/register-nodes-bulk',
                data: {
                    allNetworkNodes: [...salkovsky.networkNodes, salkovsky.currentNodeURL]
                }
            };
            return axios(bulkRegisterOptions)
        })
        .then(data => {
            res.json({ note: 'New node registered with the network successfully' })
        })
});

app.post('/register-node', (req, res) => {
    const newNodeURL = req.body.newNodeURL;
    if (salkovsky.networkNodes.indexOf(newNodeURL) == -1 && newNodeURL !== salkovsky.currentNodeURL) {
        salkovsky.networkNodes.push(newNodeURL)
    };
    res.json({
        note: 'New node registered successfully.'
    })
});

app.post('/register-nodes-bulk', (req, res) => {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeURL => {
        if (salkovsky.networkNodes.indexOf(networkNodeURL) == -1 && networkNodeURL !== salkovsky.currentNodeURL) {
            salkovsky.networkNodes.push(networkNodeURL)
        }
    });
    res.json({
        note: 'Bulk registration successfull'
    });
}); 

app.get('/consensus', (req, res) => {
    let requestPromises = [];
    salkovsky.networkNodes.forEach(networkNodeURL => {
        const reqOptions = {
            method: 'get',
            url: networkNodeURL + '/blockchain'
        }
        requestPromises.push(axios(reqOptions));
    });
    Promise.all(requestPromises)
        .then(blockchains => {
            const currentChainLength = salkovsky.chain.length;
            let maxChainLength = currentChainLength;
            let newLongestChain = null;
            let newPendingTransactions = null;

            blockchains.forEach(blockchain => {
                if (blockchain.data.chain.length > maxChainLength) {
                    maxChainLength = blockchain.data.chain.length;
                    newLongestChain = blockchain.data.chain;
                    newPendingTransactions = blockchain.data.pendingTransactions;
                };
            });

            if (!newLongestChain || (newLongestChain && !salkovsky.chainIsValid(newLongestChain))) {
                res.json({
                    note: 'Current node has not been replaced',
                    chain: salkovsky.chain
                });
            } else if (newLongestChain && salkovsky.chainIsValid(newLongestChain)) {
                salkovsky.chain = newLongestChain;
                salkovsky.pendingTransactions = newPendingTransactions;
                res.json({
                    note: 'This chain has been replaced',
                    chain: salkovsky.chain
                });
            }
        });
});

app.get('/block/:block_hash', (req, res) => {
    const blockHash = req.params.block_hash;
    const block = salkovsky.getBlock(blockHash);
    res.json({
        block: block
    });
});

app.get('/transaction/:transaction_id', (req, res) => {
    const transactionId = req.params.transaction_id;
    const transactionData = salkovsky.getTransaction(transactionId);
    res.json({
        transaction: transactionData.transaction,
        block: transactionData.block
    });
});

app.get('/address/:address', (req, res) => {
    const address = req.params.address;
    const addressData = salkovsky.getAddressData(address);
    res.json({
        addressData: addressData
    })
});

app.get('/block-explorer', (req, res) => {
    res.sendFile('./block-explorer/index.html', { root: __dirname });
});

app.listen(port, () => {
    console.log(`API is now listening on port ${port} ...`)
});
