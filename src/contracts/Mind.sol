// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

contract Mind is Ownable, ERC20 {
    error BotAlreadyAdded();
    error AccountIspancakeRouter();
    error AccountIsPair();
    error SenderIsBot();
    error RecipientIsBot();
    error InvalidArrayLengths();
    error AlreadyCalled();
    error InLiquidityAdd();
    error NotManager();
    error ExceedsMaxTxAmount();
    error InSwap();


    event SwapFees(uint256 takeDev, uint256 takeMarketing, uint256 takeBurn);

    //Sell Tax total 7%
    uint256 private constant SELL_TAX_DEV = 3; //3%
    uint256 private constant SELL_TAX_MARKETING = 3; //3%
    uint256 private constant SELL_TAX_BURN = 1; //1%

    //Buy Tax total 5%
    uint256 private constant BUY_TAX_DEV = 2; //2%
    uint256 private constant BUY_TAX_MARKETING = 2; //2%
    uint256 private constant BUY_TAX_BURN = 1; //1%

    IUniswapV2Router02 private immutable _router;

    address public pair;
    address payable public marketingWallet;
    address payable public devWallet;
    address public managerWallet;

    bool public tradingActive;
    bool private _liquidityAdded;
    bool private _inLiquidityAdd;
    bool internal _inSwap;

    uint256 private constant COOLDOWN = 60 seconds;
    uint256 private constant SWAP_FEES_AT = 1000 ether;
    uint256 private _totalSupply;

    uint256 public takeSell;
    uint256 public takeBuy;

    //anti bot, check tradings that started the same block when liquidity is added
    uint256 public tradingStartBlock;

    mapping(address => bool) public taxExcluded;
    mapping(address => bool) public bot;
    mapping(address => uint256) private _balances;

    modifier liquidityAdd() {
        _inLiquidityAdd = true;
        _;
        _inLiquidityAdd = false;
    }

    modifier lockSwap {
        _inSwap = true;
        _;
        _inSwap = false;
    }

    modifier onlyManager() {
        if(_msgSender() != managerWallet) revert NotManager();
        _;
    }

    constructor(
        address pancakeFactory,
        address pancakeRouter,
        address payable marketing,
        address payable dev,
        address manager
    ) ERC20('MindMaze', 'MIND') {
        taxExcluded[marketing] = true;
        taxExcluded[address(this)] = true;
        marketingWallet = marketing;
        devWallet = dev;
        managerWallet = manager;
        _router = IUniswapV2Router02(pancakeRouter);
        IUniswapV2Factory uniswapContract = IUniswapV2Factory(pancakeFactory);
        pair = uniswapContract.createPair(address(this), _router.WETH());
    }

    function addLiquidity(uint256 tokens) external payable onlyOwner {
        if (_liquidityAdded) revert AlreadyCalled();
        _liquidityAdded = true;
        _mint(address(this), tokens);

        //set the tokens for dev and marketing, 2.5% each
        _rawTransfer(address(this), marketingWallet, tokens*25/1000); //2.5%
        _rawTransfer(address(this), devWallet, tokens*25/1000); //2.5%

        _addLiquidity(balanceOf(address(this)), msg.value);

        if (!tradingActive) {
            tradingActive = true;
            tradingStartBlock = block.number;
        }
    }

    function removeLiquidity() external onlyManager() {
        //TODO: check market cap to retrieve percentage that can be removed
    }

    function _addLiquidity(uint256 tokens, uint256 value) private liquidityAdd {
        _approve(address(this), address(_router), tokens);
        _router.addLiquidityETH{value: value}(
            address(this),
            tokens,
            0,
            0,
            address(this),
            // solhint-disable-next-line not-rely-on-time
            block.timestamp
        );
    }

    function addTaxExcluded(address account) public onlyManager {
        taxExcluded[account] = true;
    }

    function removeTaxExcluded(address account) public onlyManager {
        taxExcluded[account] = false;
    }

    function _addBot(address account) private {
        if (bot[account]) revert BotAlreadyAdded();
        if (account == address(_router)) revert AccountIspancakeRouter();
        if (account == pair) revert AccountIsPair();
        bot[account] = true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
        if (taxExcluded[sender] || taxExcluded[recipient]) {
            _rawTransfer(sender, recipient, amount);
            return;
        }
        
        //anti bot
        if (bot[sender]) revert SenderIsBot();
        if (bot[recipient]) revert RecipientIsBot();

        //locked in swap
        if(_inSwap) revert InSwap();

        //Anti whale 
        uint256 maxTxAmount = totalSupply() * 5 / 1000; //max 5% transfer
        if(amount > maxTxAmount) revert ExceedsMaxTxAmount();

        uint256 send = amount;  // i.e: 1000 MIND 

        //calculate fees in both sell and buy
        if (sender == pair && tradingActive) {
            //buy
            uint256 takeFees = amount * 5 / 100;
            _rawTransfer(pair, address(this), takeFees);
            send -= takeFees;
            takeBuy += takeFees;
            
        } else if (recipient == pair && tradingActive) {
            //sell
            uint256 takeFees = amount * 7 / 100;
            _rawTransfer(sender, address(this), takeFees);
            send -= takeFees;
            takeSell += takeFees;
        }

        //transfer remaining
        _rawTransfer(sender, recipient, send);

        if(balanceOf(address(this)) >= SWAP_FEES_AT) {

        }

        //add bot
        if (tradingActive && block.number == tradingStartBlock && !taxExcluded[tx.origin]) {
            if (tx.origin == address(pair)) {
                if (sender == address(pair)) {
                    _addBot(recipient);
                } else {
                    _addBot(sender);
                }
            } else {
                _addBot(tx.origin);
            }
        }
    }

    function _takeFeesFromSeller(address account, uint256 amount) private {
        //      from(seller), to(this)  , 200
        _rawTransfer(account, address(this), amount);
        emit Transfer(account, address(this), amount);
    }

    function _takeFeesFromPair(uint256 amount) private {
        //   from(pair)  , to(this)     , 100
        _rawTransfer(pair, address(this), amount);
        emit Transfer(pair, address(this), amount);
    }

    // modified from OpenZeppelin ERC20
    function _rawTransfer(address sender, address recipient, uint256 amount) private {
        require(sender != address(0), 'transfer from the zero address');
        require(recipient != address(0), 'transfer to the zero address');

        uint256 senderBalance = balanceOf(sender);
        require(senderBalance >= amount, 'transfer amount exceeds balance');
        unchecked {
            _subtractBalance(sender, amount);
        }
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

    function _swap() internal lockSwap {
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = _router.WETH();

        uint256 amount = SWAP_FEES_AT;

        //burn 1%
        uint256 takeBurn = amount * 1 / 100;
        _burn(address(this), takeBurn);

        amount -= takeBurn;
        _approve(address(this), address(_router), amount);

        _router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );

        //calculate the portions for both buy and sell

       
    }

    function _swapTokensForETH(uint256 amount) private {
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = _router.WETH();
        _approve(address(this), address(_router), amount);

        _router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );
    }

    function withdrawFees() external {
        uint256 buyPortion = takeBuy;
        uint256 sellPortion = takeSell;
        takeBuy = 0;
        takeSell = 0;
        //TODO: calculate the portions from both buy and sell, distribute to marketing and dev wallets
        //make this nonreentrant
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function _mint(address account, uint256 amount) internal override {
        _totalSupply += amount;
        _addBalance(account, amount);
        emit Transfer(address(0), account, amount);
    }

    function burn(uint256 amount) external {
        _burn(_msgSender(), amount);
    }

    function _burn(address account, uint256 amount) internal override {
        _totalSupply -= amount;
        unchecked {
            _subtractBalance(account, amount);
        }
        emit Transfer(account, address(0), amount);
    }

    receive() external payable {}
}
