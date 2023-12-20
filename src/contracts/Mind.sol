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

    uint256 private constant COOLDOWN = 60 seconds;
    uint256 private constant SWAP_FEES_AT = 1000 ether;
    uint256 private _totalSupply;

    uint256 public tradingStartBlock;

    mapping(address => bool) public taxExcluded;
    mapping(address => bool) public bot;
    mapping(address => uint256) private _balances;

    modifier liquidityAdd() {
        _inLiquidityAdd = true;
        _;
        _inLiquidityAdd = false;
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
        _mint(marketingWallet, tokens * 2/100);

        _addLiquidity(tokens, msg.value);

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

    function removeBot(address account) public  {
        bot[account] = false;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
        if (taxExcluded[sender] || taxExcluded[recipient]) {
            _rawTransfer(sender, recipient, amount);
            return;
        }
        if (bot[sender]) revert SenderIsBot();
        if (bot[recipient]) revert RecipientIsBot();

        uint256 send = amount; // i.e: 1000
        uint256 takeFees;

        //TODO: calculate fees in both sell and buy
        // if ((sender == pair && tradingActive) || (recipient == pair && tradingActive)) {
        //     // Buy or Sell, apply buy fee schedule
        //     takeFees = (amount * FEES) / 100; //5%
        //     if (sender == pair) _takeFeesFromPair(takeFees);
        //     else if (recipient == pair) _takeFeesFromSeller(sender, takeFees);
        // }
        unchecked {
            send -= takeFees;
        }

        //            pair    buyer     900
        _rawTransfer(sender, recipient, send);

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

    function swapAll() external {
        if (_inLiquidityAdd) revert InLiquidityAdd();

        _swapFees();
    }

    //TODO: calculate fees
    function _swapFees() private {
        uint256 fees = balanceOf(address(this));
        // uint256 takeMarketing = (fees * MARKETING_RATE) / 100;

        // _swapTokensForETH(takeMarketing);

        // uint256 ethBalance = address(this).balance;

        // marketingWallet.transfer(ethBalance);

        // emit SwapFees(takeMarketing, ethBalance);
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
