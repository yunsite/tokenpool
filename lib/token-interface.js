


const Tx = require('ethereumjs-tx')

var tokenContractJSON = require('../app/assets/contracts/_0xBitcoinToken.json');
var deployedContractInfo = require('../app/assets/contracts/DeployedContractInfo.json');
var web3Utils = require('web3-utils')


//var busySendingSolution = false;
//var queuedMiningSolutions = [];

//var queuedTokenTransfers = []; //keep trying if failed to mine or something
//var queuedTokenTransferCount = 0;
//var lastSubmittedMiningSolutionChallengeNumber;



//  var busySendingTransfer = false;


  var transactionCoordinator = require('./transaction-coordinator')

/**
BUG : pool is resending transactions!

**/




module.exports =  {


  async init(redisInterface, web3, accountConfig, poolConfig, test_mode )
  {

    this.redisInterface=redisInterface;
    this.web3=web3;
    this.test_mode = test_mode;
    this.poolConfig = poolConfig;
    this.accountConfig = accountConfig;
    this.tokenContract =  new web3.eth.Contract(tokenContractJSON.abi,this.getTokenContractAddress())


    transactionCoordinator.init(web3,this.tokenContract,poolConfig,accountConfig,redisInterface,this)


  //  this.difficultyTarget = 111;
    //this.challengeNumber = 1111;
    var self=this;

    await self.collectTokenParameters();

    setInterval(function(){ self.collectTokenParameters()},2000);

  //  await self.queueTokenTransfersForBalances()


    setTimeout(function(){ self.queueTokenTransfersForBalances()} , 0)



  },

  getPoolChallengeNumber()
  {
    return this.challengeNumber;
  },

  getPoolDifficultyTarget()
  {
    return this.difficultyTarget;
  },

  getPoolDifficulty()
  {
    return this.miningDifficulty;
  },


  async collectTokenParameters( )
  {


    var miningDifficultyString = await this.tokenContract.methods.getMiningDifficulty().call()  ;
    var miningDifficulty = parseInt(miningDifficultyString)

    var miningTargetString = await this.tokenContract.methods.getMiningTarget().call()  ;
    var miningTarget = web3Utils.toBN(miningTargetString)

    var challengeNumber = await this.tokenContract.methods.getChallengeNumber().call() ;

    console.log('Mining difficulty:', miningDifficulty);
    console.log('Challenge number:', challengeNumber)

      this.miningDifficulty = miningDifficulty;
      this.difficultyTarget = miningTarget;
      this.challengeNumber = challengeNumber;

  },

  getTokenContractAddress()
  {
    if(this.test_mode)
    {
      return deployedContractInfo.networks.testnet.contracts._0xbitcointoken.blockchain_address;
    }else{
      return deployedContractInfo.networks.mainnet.contracts._0xbitcointoken.blockchain_address;
    }

  },



//use address from ?
  async queueMiningSolution( solution_number,minerEthAddress,challenge_digest,challenge_number )
  {

    var currentTokenMiningReward = await this.requestCurrentTokenMiningReward()


      var txData= {
          minerEthAddress: minerEthAddress,    //we use this differently in the pool!
          solution_number: solution_number,
          challenge_digest: challenge_digest,
          challenge_number: challenge_number,
          tokenReward: currentTokenMiningReward
        }

        transactionCoordinator.addTransactionToQueue('solution',txData)

  },

//minerEthAddress
  async queueTokenTransfer(addressTo, tokenAmount)
  {
    var txData= {

      addressTo:addressTo,
      tokenAmount:tokenAmount,

    }


    transactionCoordinator.addTransactionToQueue('transfer',txData)


  },





  async queueTokenTransfersForBalances()
  {

    var self = this ;


    var min_balance_for_transfer = this.poolConfig.minBalanceForTransfer; //this is in token-satoshis

    //for each miner


  var minerList =  await this.getMinerList()

    for(i in minerList) //reward each miner
    {
      var minerAddress = minerList[i];

       var minerData = await this.getMinerData(minerAddress)

       var miner_token_balance = minerData.tokenBalance;

       if(miner_token_balance > min_balance_for_transfer)
       {

         console.log('transfer tokens to   ' ,minerAddress)

         minerData.tokensAwarded += miner_token_balance;
         minerData.tokenBalance = 0;


         //should store queued xfers in REDIS instead and monitor them for pending/success
         this.queueTokenTransfer(minerAddress,miner_token_balance);

         this.saveMinerDataToRedis(minerAddress,minerData)

       }

    }

    //if balance is higher than this

    //drain their balance and send that many tokens to them


      setTimeout(function(){ self.queueTokenTransfersForBalances()} , 0)


  },

  async saveMinerDataToRedis(minerEthAddress, minerData)
  {
    this.redisInterface.storeRedisHashData("miner_data", minerEthAddress , JSON.stringify(minerData))

  },

  async getMinerData(minerEthAddress)
  {

    var minerDataJSON = await this.redisInterface.findHashInRedis("miner_data", minerEthAddress );

    return JSON.parse(minerDataJSON) ;

  },


  //copied from peer
  async getMinerList( )
  {
      var minerData = await this.redisInterface.getResultsOfKeyInRedis("miner_data" );

      return minerData;

  },




   async requestCurrentTokenMiningReward()
   {


     var self = this ;
     var reward_amount =  new Promise(function (fulfilled,error) {

       self.tokenContract.methods.getMiningReward().call(function(err, result){
          if(err){error(err);return;}

          fulfilled(result)

        });
      });



     return reward_amount;
   },






}
