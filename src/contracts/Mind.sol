// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import './uniswap/IUniswapPair.sol';

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

interface IUniswapV2Locker {
    function relock (address _lpToken, uint256 _index, uint256 _lockID, uint256 _unlock_date) external;
    function withdraw (address _lpToken, uint256 _index, uint256 _lockID, uint256 _amount) external;
    function lockLPToken (address _lpToken, uint256 _amount, uint256 _unlock_date, address payable _referral, bool _fee_in_eth, address payable _withdrawer) external payable;
}

/**  
@dev 
MIND token will take 7% fees for each sell (3% marketing, 3% dev, 1% burn) 
MIND token will take 5% fees for each buy (2% marketing, 2% dev, 1% burn) 
*/
contract Mind is Ownable, ERC20 {
    error BotAlreadyAdded();
    error AccountIsUniswapRouter();
    error AccountIsPair();
    error IsBot();
    error AlreadyCalled();
    error NotManager();
    error SenderAddressIsZero();
    error RecipientrAddressIsZero();
    error InsufficientBalance();
    error LiquidityLocked();
    error OnReentrancyGuard();
    error ExceedsMaxTransfer();

    IUniswapV2Router02 private immutable _router;

    address private constant UNCX_LOCKER = 0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214;
    address public pair;
    address payable private _splitter;
    address public managerWallet;

    bool private _liquidityAdded;
    bool private _inSwap;
    bool private _locked;

    uint256 public swapFeesAt = 3000000 ether;
    uint256 private constant INITIAL_LIQUIDITY_LOCK_TIME = 3 * 30 * 24 * 60 * 60; //3 months initial liquidity lock
    uint256 private constant LOCK_PRICE = 0.1 ether; //price to pay for inital lock
    uint256 private _totalSupply;
    uint256 private _initialLiquidityWeth;
    uint256 public nextLPUnlock;
    uint256 private _collectedFees;

    //anti bot, check tradings that started the same block when liquidity is added

    mapping(address => bool) public taxExcluded;
    mapping(address => bool) public bot;
    mapping(address => uint256) private _balances;

    modifier lockSwap() {
        _inSwap = true;
        _;
        _inSwap = false;
    }

    modifier onlyManager() {
        if (_msgSender() != managerWallet) revert NotManager();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert OnReentrancyGuard();
        require(!_locked, 'ReentrancyGuard: reentrant call');
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        address uniswapFactory,
        address uniswapRouter,
        address payable splitter,
        address manager
    ) ERC20('MindMaze', 'MIND') {
        taxExcluded[splitter] = true;
        taxExcluded[manager] = true;
        taxExcluded[address(this)] = true;
        _splitter = splitter;
        managerWallet = manager;
        _router = IUniswapV2Router02(uniswapRouter);
        IUniswapV2Factory uniswapContract = IUniswapV2Factory(uniswapFactory);
        pair = uniswapContract.createPair(address(this), _router.WETH());
    }

    function addLiquidity(uint256 tokens) external payable onlyOwner nonReentrant {
        if (_liquidityAdded) revert AlreadyCalled();
        _liquidityAdded = true;
        _mint(address(this), tokens);

        _addLiquidity(balanceOf(address(this)), msg.value - LOCK_PRICE);
    }

    //lock liquidity if weth balance of pair is 100x from initial weth liquidity provided
    function removeLiquidity(address receiver) external onlyManager {
        if (nextLPUnlock > block.timestamp) revert LiquidityLocked();

        //check the trading volume exceeds 50X the inital liquidity, if so, relock for one more year;
        if (_initialLiquidityWeth < _collectedFees) {
            uint256 lpUnlockDate = block.timestamp + 365 * 24 * 60 * 60;
            IUniswapV2Locker(UNCX_LOCKER).relock(pair, 0, 0, lpUnlockDate);
            nextLPUnlock = lpUnlockDate;
            _collectedFees = 0;
        } else {
            IUniswapPair uniswapV2Pair = IUniswapPair(pair);

            // Get the balance of LP tokens held by this contract
            uint256 liquidity = uniswapV2Pair.balanceOf(UNCX_LOCKER);

            // // Approve the router to spend the LP tokens
            uniswapV2Pair.approve(address(_router), liquidity);

            IUniswapV2Locker(UNCX_LOCKER).withdraw(pair, 0, 0, liquidity);

            taxExcluded[pair] = true;
            _router.removeLiquidityETH(address(this), liquidity, 0, 0, receiver, block.timestamp);
            taxExcluded[pair] = false;
        }
    }

    function _addLiquidity(uint256 tokens, uint256 value) private {
        _approve(address(this), address(_router), tokens);
        (, uint amountETH, ) = _router.addLiquidityETH{value: value}(
            address(this),
            tokens,
            0,
            0,
            address(this),
            // solhint-disable-next-line not-rely-on-time
            block.timestamp
        );
        _initialLiquidityWeth = amountETH;
        _initalLock();
    }

    function pairBalance() public view returns (uint256) {
        IUniswapPair uniswapV2Pair = IUniswapPair(pair);

        // Get the balance of LP tokens held by this contract
        uint256 liquidity = uniswapV2Pair.balanceOf(address(this));
        return liquidity;
    }

    function _initalLock() private {
        IUniswapPair uniswapV2Pair = IUniswapPair(pair);
        uint256 liquidity = uniswapV2Pair.balanceOf(address(this));
        uniswapV2Pair.approve(UNCX_LOCKER, liquidity);
        uint256 lpUnlockDate = block.timestamp + INITIAL_LIQUIDITY_LOCK_TIME;

        IUniswapV2Locker(UNCX_LOCKER).lockLPToken{value: LOCK_PRICE}(
            pair,
            liquidity,
            lpUnlockDate,
            payable(address(0)),
            true,
            payable(address(this))
        );
    
        nextLPUnlock = lpUnlockDate;
    }

    function addTaxExcluded(address account) public onlyManager {
        taxExcluded[account] = true;
    }

    function removeTaxExcluded(address account) public onlyManager {
        taxExcluded[account] = false;
    }

    function setSplitterWallet(address payable splitter) public onlyManager {
        _splitter = splitter;
    }

    function addBot(address b) public onlyManager {
        _addBot(b);
    }

    function removeBot(address b) public onlyManager {
        bot[b] = false;
    }

    function setSwapFeesAt(uint256 val) public onlyManager {
        swapFeesAt = val;
    }

    function _addBot(address account) private {
        if (bot[account]) revert BotAlreadyAdded();
        if (account == address(_router)) revert AccountIsUniswapRouter();
        if (account == pair) revert AccountIsPair();
        bot[account] = true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
        if (taxExcluded[sender] || taxExcluded[recipient]) {
            _rawTransfer(sender, recipient, amount);
            return;
        }

        //anti whale 
        if(amount > (totalSupply() * 5) / 100)  revert ExceedsMaxTransfer();

        //anti bot
        if (bot[sender] || bot[recipient]) revert IsBot();

        //swap when balance reaches 100000 MIND
        if (balanceOf(address(this)) >= swapFeesAt  && sender != pair) {
            swap();
        }

        uint256 send = amount; // i.e: 1000 MIND

        if ((sender == pair || recipient == pair)) {
            //buy and sell 3% fees
            uint256 takeFees = (amount * 3) / 100;
            _rawTransfer(sender, address(this), takeFees);
            send -= takeFees;
        }

        //transfer remaining
        _rawTransfer(sender, recipient, send);
    }

    // modified from OpenZeppelin ERC20
    function _rawTransfer(address sender, address recipient, uint256 amount) private {
        _subtractBalance(sender, amount);
        _addBalance(recipient, amount);
        emit Transfer(sender, recipient, amount);
    }

    function _addBalance(address account, uint256 amount) private {
        _balances[account] += amount;
    }

    function _subtractBalance(address account, uint256 amount) private {
        _balances[account] -= amount;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function swap() public lockSwap {
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = _router.WETH();

        uint256 amount = swapFeesAt;

        _approve(address(this), address(_router), amount);

        uint256 balanceBefore = address(this).balance;
        _router.swapExactTokensForETHSupportingFeeOnTransferTokens(amount, 0, path, address(this), block.timestamp);
        uint256 balanceAfter = address(this).balance;
        _collectedFees += (balanceAfter - balanceBefore);
        if(balanceAfter > 1 ether) withdrawFees();
    }

    //each wallet has the same portion of the fees, 33% each
    function withdrawFees() public {
        uint256 balance = address(this).balance;
        
        _splitter.transfer(balance);
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function _mint(address account, uint256 amount) internal override {
        _totalSupply += amount;
        _addBalance(account, amount);
        emit Transfer(address(0), account, amount);
    }

    receive() external payable {}
}
