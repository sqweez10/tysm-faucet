// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TYSMReferralRewards
 * @notice Tiered referral reward pool for TYSM Daily Faucet.
 *         Owner registers confirmed referrals (validated off-chain via Redis).
 *         Referrers accumulate TYSM and can claim any time.
 *
 * Tier rewards:
 *   Referrals  1–5  → 5,000  TYSM each
 *   Referrals  6–10 → 8,000  TYSM each
 *   Referrals 11+   → 12,000 TYSM each
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract TYSMReferralRewards {
    address public owner;
    IERC20  public immutable tysm;

    // ─── Tier Rewards ────────────────────────────────────────────
    uint256 public constant TIER1_REWARD = 5_000  * 1e18;  // refs  1–5
    uint256 public constant TIER2_REWARD = 8_000  * 1e18;  // refs  6–10
    uint256 public constant TIER3_REWARD = 12_000 * 1e18;  // refs 11+

    // ─── State ───────────────────────────────────────────────────
    mapping(address => uint256) public referralCount;   // referrer → # referrals confirmed
    mapping(address => uint256) public pendingRewards;  // referrer → claimable TYSM (wei)
    mapping(address => bool)    public isReferred;      // referee  → already registered

    // ─── Events ──────────────────────────────────────────────────
    event ReferralRegistered(address indexed referrer, address indexed referee, uint256 reward);
    event RewardClaimed(address indexed user, uint256 amount);
    event Deposited(address indexed from, uint256 amount);
    event OwnershipTransferred(address indexed prev, address indexed next);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(address _tysm) {
        require(_tysm != address(0), "Zero token address");
        owner = msg.sender;
        tysm  = IERC20(_tysm);
    }

    // ─── Owner: register a confirmed referral ────────────────────
    /**
     * @notice Call this after off-chain verification (Redis) confirms
     *         that `referee` joined via `referrer`'s link.
     *         Idempotent: silently no-ops if referee is already registered.
     */
    function registerReferral(address referrer, address referee) external onlyOwner {
        require(referrer != address(0) && referee != address(0), "Zero address");
        require(referrer != referee, "Self-referral");
        if (isReferred[referee]) return; // idempotent — safe to call multiple times

        isReferred[referee]    = true;
        referralCount[referrer]++;

        uint256 count  = referralCount[referrer];
        uint256 reward = count <= 5  ? TIER1_REWARD
                       : count <= 10 ? TIER2_REWARD
                       : TIER3_REWARD;

        pendingRewards[referrer] += reward;
        emit ReferralRegistered(referrer, referee, reward);
    }

    // ─── Batch register (gas-efficient for many referrals) ───────
    function registerReferralBatch(
        address[] calldata referrers,
        address[] calldata referees
    ) external onlyOwner {
        require(referrers.length == referees.length, "Length mismatch");
        for (uint256 i = 0; i < referrers.length; i++) {
            address referrer = referrers[i];
            address referee  = referees[i];
            if (referrer == address(0) || referee == address(0)) continue;
            if (referrer == referee) continue;
            if (isReferred[referee]) continue;

            isReferred[referee]    = true;
            referralCount[referrer]++;

            uint256 count  = referralCount[referrer];
            uint256 reward = count <= 5  ? TIER1_REWARD
                           : count <= 10 ? TIER2_REWARD
                           : TIER3_REWARD;

            pendingRewards[referrer] += reward;
            emit ReferralRegistered(referrer, referee, reward);
        }
    }

    // ─── Referrer: claim accumulated rewards ─────────────────────
    function claimRewards() external {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "No rewards to claim");
        require(tysm.balanceOf(address(this)) >= amount, "Pool empty — refill soon");

        pendingRewards[msg.sender] = 0;
        require(tysm.transfer(msg.sender, amount), "Transfer failed");
        emit RewardClaimed(msg.sender, amount);
    }

    // ─── Owner: fund the reward pool ─────────────────────────────
    function deposit(uint256 amount) external onlyOwner {
        require(tysm.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit Deposited(msg.sender, amount);
    }

    // ─── Owner: emergency withdraw ───────────────────────────────
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(tysm.transfer(owner, amount), "Transfer failed");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── Views ───────────────────────────────────────────────────
    function poolBalance() external view returns (uint256) {
        return tysm.balanceOf(address(this));
    }
}
