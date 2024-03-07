const Blockchain = require('./blockchain');

myblockchain = new Blockchain();

const previousBlockHash = '1231HKSDBFAJF123';
const currentBlockData = [
    {
        amount: 100, 
        sender: '1h3oqlasn',
        recipient: '12uyiuafil'
    },
    {
        amount: 150, 
        sender: '1h3oqlasn',
        recipient: '12uyiuafil'
    },
    {
        amount: 100, 
        sender: '1h3oqlasn',
        recipient: '12uyiuafil'
    }
]

console.log(myblockchain.proofOfWork(previousBlockHash, currentBlockData))
