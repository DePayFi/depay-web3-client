import { ethers } from 'ethers';
import { getWallet } from 'depay-web3-wallets';

function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }let getWindow = () => {
  if (typeof global == 'object') return global
  return window
};

let getCacheStore = () => {
  if (getWindow()._cacheStore == undefined) {
    resetCache();
  }
  return getWindow()._cacheStore
};

let getPromiseStore = () => {
  if (getWindow()._promiseStore == undefined) {
    resetCache();
  }
  return getWindow()._promiseStore
};

let resetCache = () => {
  getWindow()._cacheStore = {};
  getWindow()._promiseStore = {};
};

let set = function ({ key, value, expires }) {
  getCacheStore()[key] = {
    expiresAt: Date.now() + expires,
    value,
  };
};

let get = function ({ key, expires }) {
  let cachedEntry = getCacheStore()[key];
  if (_optionalChain([cachedEntry, 'optionalAccess', _ => _.expiresAt]) > Date.now()) {
    return cachedEntry.value
  }
};

let getPromise = function({ key }) {
  return getPromiseStore()[key]
};

let setPromise = function({ key, promise }) {
  getPromiseStore()[key] = promise;
  return promise
};

let deletePromise = function({ key }) {
  getPromiseStore()[key] = undefined; 
};

let cache = function ({ call, key, expires = 0 }) {
  return new Promise((resolve, reject)=>{
    let value;
    key = JSON.stringify(key);
    
    // get existing promise (of a previous pending request asking for the exact same thing)
    let existingPromise = getPromise({ key });
    if(existingPromise) { return existingPromise.then((value)=>{
      return resolve(value)
    }) }

    setPromise({ key, promise: new Promise((resolveQueue, rejectQueue)=>{
      if (expires === 0) {
        return resolveQueue(resolve(call()))
      }
      
      // get cached value
      value = get({ key, expires });
      if (value) {
        return resolveQueue(resolve(value))
      }

      // set new cache value
      call()
        .then((value)=>{
          if (value) {
            set({ key, value, expires });
          }
          resolveQueue(resolve(value));
        })
        .catch((error)=>{
          rejectQueue(reject(error));
        });
      })
    }).then(()=>{
      deletePromise({ key });
    });
  })
};

async function ethereumProvider () {
  let wallet = getWallet();
  let account = await wallet.account();

  if (account && await wallet.connectedTo('ethereum')) {
    return await new ethers.providers.Web3Provider(window.ethereum)
  } else {
    return await new ethers.providers.JsonRpcProvider(
      ['https://mainnet.infu', 'ra.io/v3/9aa3d95b3bc440fa8', '8ea12eaa4456161'].join(''),
    )
  }
}

let paramsToContractArgs = ({ contract, method, params }) => {
  let fragment = contract.interface.fragments.find((fragment) => {
    return fragment.name == method
  });

  return fragment.inputs.map((input, index) => {
    if (Array.isArray(params)) {
      return params[index]
    } else {
      return params[input.name]
    }
  })
};

let contractCall = ({ address, api, method, params, provider }) => {
  let contract = new ethers.Contract(address, api, provider);
  let args = paramsToContractArgs({ contract, method, params });
  return contract[method](...args)
};

let balance = ({ address, provider }) => {
  return provider.getBalance(address)
};

var request = async ({ provider, address, api, method, params }) => {
  if (api) {
    return contractCall({ address, api, method, params, provider })
  } else if (method === 'balance') {
    return balance({ address, provider })
  }
};

var requestEthereum = async ({ address, api, method, params }) => {
  let provider = await ethereumProvider();

  return request({
    provider,
    address,
    api,
    method,
    params
  })
};

async function bscProvider () {
  let wallet = getWallet();
  let account = await wallet.account();

  if (account && await wallet.connectedTo('bsc')) {
    return await new ethers.providers.Web3Provider(window.ethereum)
  } else {
    return await new ethers.providers.JsonRpcProvider(
      'https://bsc-dataseed.binance.org'
    )
  }
}

var requestBsc = async ({ address, api, method, params }) => {
  let provider = await bscProvider();

  return request({
    provider,
    address,
    api,
    method,
    params
  })
};

var parseUrl = (url) => {
  if (typeof url == 'object') {
    return url
  }
  let deconstructed = url.match(/(?<blockchain>\w+):\/\/(?<address>[\w\d]+)\/(?<method>[\w\d]+)/);
  return deconstructed.groups
};

let request$1 = async function (url, options) {
  let { blockchain, address, method } = parseUrl(url);
  let { api, params, cache: cache$1 } = options || {};
  let result = await cache({
    expires: cache$1 || 0,
    key: [blockchain, address, method, params],
    call: () => {
      switch (blockchain) {

        case 'ethereum':
          return requestEthereum({ address, api, method, params })

        case 'bsc':
          return requestBsc({ address, api, method, params })

        default:
          throw 'Unknown blockchain: ' + blockchain
      }
    },
  });
  return result
};

let estimate = async ({ externalProvider, address, method, api, params, value }) => {
  let account = await getWallet().account();
  if (!account) {
    throw 'No wallet connected!'
  }

  let provider = new ethers.providers.Web3Provider(externalProvider);
  let signer = provider.getSigner();

  let contract = new ethers.Contract(address, api, provider);
  let args = paramsToContractArgs({ contract, method, params });
  return contract.connect(signer).estimateGas[method](...args)
};

var estimateEthereum = async ({ address, method, api, params, value }) => {
  return estimate({
    externalProvider: window.ethereum,
    address,
    method,
    api,
    params,
    value
  })
};

var estimateBsc = async ({ address, method, api, params, value }) => {
  return estimate({
    externalProvider: window.ethereum,
    address,
    method,
    api,
    params,
    value
  })
};

let request$2 = async function (url, options) {
  let { blockchain, address, method } = parseUrl(url);
  let { api, params, value } = options || {};
  switch (blockchain) {
    
    case 'ethereum':
      return estimateEthereum({ address, method, api, params, value })

    case 'bsc':
      return estimateBsc({ address, method, api, params, value })

    default:
      throw 'Unknown blockchain: ' + blockchain
  }
};

async function provider (blockchain) {
  switch (blockchain) {
    
    case 'ethereum':
      return await ethereumProvider()

    case 'bsc':
      return await bscProvider()
    
    default:
      throw 'Unknown blockchain: ' + blockchain
  }
}

export { request$2 as estimate, provider, request$1 as request, resetCache };
