# Manual Testing Guide - Economy & Combat Rebalancing

## Overview
This guide covers manual testing of all economy and combat fixes implemented on 2025-12-02.

---

## 1. Banking System Tests

### 1.1 StarDock Location Requirement
**Test:** Verify banking only works at StarDock

**Steps:**
1. Start with a player in a non-StarDock sector (e.g., sector 11)
2. Try to access banking (should not be available in UI)
3. Navigate to a StarDock sector (sector 5 - TerraSpace StarDock)
4. Verify banking panel is accessible
5. Try to deposit credits - should work
6. Move to a regular port sector
7. Try to withdraw via API directly (if possible) - should fail with "Must be at StarDock" error

**Expected Results:**
- ✅ Banking UI only appears at StarDock
- ✅ Deposit/withdraw/transfer blocked when not at StarDock
- ✅ Error message mentions StarDock requirement

---

### 1.2 Withdrawal Fee (5%)
**Test:** Verify 5% withdrawal fee is charged

**Steps:**
1. Be at a StarDock
2. Deposit ₡10,000 to bank
3. Withdraw ₡1,000
4. Check player credits received
5. Check bank balance remaining
6. Check transaction memo

**Expected Results:**
- ✅ Player receives ₡950 (₡1,000 - ₡50 fee)
- ✅ Bank balance shows ₡9,000 remaining (₡10,000 - ₡1,000)
- ✅ Transaction memo mentions "Withdrawal fee: ₡50"
- ✅ UI shows fee preview before withdrawal
- ✅ Success message shows fee and net amount received

**Test Different Amounts:**
- Withdraw ₡2,000 → Should receive ₡1,900 (fee: ₡100)
- Withdraw ₡5,000 → Should receive ₡4,750 (fee: ₡250)

---

### 1.3 Death Penalty on Bank Balance (25%)
**Test:** Verify bank balance loses 25% on death

**Steps:**
1. Deposit ₡20,000 to bank
2. Have ₡10,000 on-hand credits
3. Get killed in combat (have another player attack you)
4. Check bank balance after respawn
5. Check on-hand credits after respawn

**Expected Results:**
- ✅ Bank balance: ₡15,000 (lost ₡5,000 = 25%)
- ✅ On-hand credits: ₡7,500 (lost ₡2,500 = 25%)
- ✅ Total loss: ₡7,500 (25% of ₡30,000 total)

---

## 2. Combat System Tests

### 2.1 Turn Cost (1 Turn Per Attack)
**Test:** Verify combat costs only 1 turn

**Steps:**
1. Have 10 turns remaining
2. Attack another player
3. Check turns after attack

**Expected Results:**
- ✅ Turns remaining: 9 (10 - 1)
- ✅ Can attack with only 1 turn remaining
- ✅ Cannot attack with 0 turns

---

### 2.2 Loot Percentage (75%)
**Test:** Verify attacker gets 75% of victim's credits/cargo

**Steps:**
1. Victim: Have ₡10,000 credits, 100 fuel, 200 organics, 300 equipment
2. Attacker: Have strong ship (100+ fighters, 100+ shields)
3. Attacker destroys victim
4. Check attacker's credits and cargo after combat

**Expected Results:**
- ✅ Attacker receives ₡7,500 credits (75% of ₡10,000)
- ✅ Attacker receives 75 fuel (75% of 100)
- ✅ Attacker receives 150 organics (75% of 200)
- ✅ Attacker receives 225 equipment (75% of 300)

---

### 2.3 Death Penalty (25% of Credits)
**Test:** Verify victim loses 25% of credits on death

**Steps:**
1. Victim: Have ₡10,000 on-hand, ₡20,000 in bank
2. Get destroyed in combat
3. Check credits after respawn

**Expected Results:**
- ✅ On-hand credits: ₡7,500 (lost ₡2,500 = 25%)
- ✅ Bank balance: ₡15,000 (lost ₡5,000 = 25%)
- ✅ Total loss: ₡7,500 (25% of ₡30,000)

---

### 2.4 Combat Profitability
**Test:** Verify combat is profitable with new balance

**Steps:**
1. Attacker: Spend 1 turn, lose 10 fighters (₡2,000 cost)
2. Destroy victim with ₡10,000 credits
3. Calculate profit

**Expected Results:**
- ✅ Turn cost: 1 turn (was 3)
- ✅ Loot received: ₡7,500 (75% of ₡10,000)
- ✅ Fighter cost: ₡2,000 (10 fighters × ₡200)
- ✅ Net profit: ₡5,500 (₡7,500 - ₡2,000)
- ✅ Profit per turn: ₡5,500 (much better than before!)

---

## 3. Sector Fighter Maintenance Tests

### 3.1 Deployment with Sufficient Funds
**Test:** Verify fighters deploy successfully

**Steps:**
1. Have ₡2,000 credits
2. Deploy 10 fighters
3. Check deployment success
4. Check UI shows daily cost

**Expected Results:**
- ✅ Fighters deploy successfully
- ✅ UI shows "Daily maintenance: ₡50/day" (10 × ₡5)
- ✅ No error messages
- ✅ Credits not deducted immediately (maintenance is daily)

---

### 3.2 Deployment Warning Display
**Test:** Verify maintenance cost warning appears

**Steps:**
1. Open deploy fighters modal
2. Enter 20 fighters
3. Check warning message

**Expected Results:**
- ✅ Warning shows: "Daily maintenance: ₡100/day"
- ✅ If credits < ₡100, shows "⚠️ Insufficient funds!"
- ✅ Warning appears in yellow/orange box

---

### 3.3 Maintenance Charging (Daily)
**Test:** Verify maintenance is charged daily

**Steps:**
1. Deploy 10 fighters (₡50/day maintenance)
2. Have ₡100 credits
3. Wait for daily maintenance tick (or manually trigger if possible)
4. Check credits after maintenance

**Expected Results:**
- ✅ ₡50 deducted from credits
- ✅ `last_maintenance` timestamp updated
- ✅ Console log shows maintenance charged

**Note:** Daily tick runs every 24 hours. For testing, you may need to:
- Wait 24 hours, OR
- Temporarily change interval to 1 minute for testing, OR
- Manually call the maintenance function

---

### 3.4 Fighter Destruction on Non-Payment
**Test:** Verify fighters destroyed when can't afford maintenance

**Steps:**
1. Deploy 10 fighters (₡50/day)
2. Have only ₡30 credits
3. Wait for daily maintenance tick
4. Check fighters status
5. Check inbox for notification

**Expected Results:**
- ✅ Fighters destroyed (deleted from sector_fighters)
- ✅ Inbox message received: "⚠️ Fighter Maintenance Failure"
- ✅ Message shows required amount (₡50) and player balance (₡30)
- ✅ Console log shows fighters destroyed

---

## 4. Planet Production Tests

### 4.1 Production Rate Buff (5x)
**Test:** Verify production rates are 5x higher

**Steps:**
1. Claim a planet
2. Set production type to "Equipment Focus"
3. Transport 1,000 colonists to planet
4. Wait 1 hour
5. Check production

**Expected Results:**
- ✅ Equipment produced: ~50 units (was ~10)
- ✅ Fuel produced: ~10 units (was ~2)
- ✅ Organics produced: ~10 units (was ~2)

**Calculation:**
- Old rate: 10 equipment per 1000 colonists/hour
- New rate: 50 equipment per 1000 colonists/hour
- At ₡94 per equipment: ₡4,700/hour (was ₡940/hour)

---

### 4.2 Citadel Production Bonus
**Test:** Verify citadel levels increase production

**Steps:**
1. Have planet with 10,000 colonists, Equipment Focus
2. Build Citadel Level 1 (+10% production)
3. Wait 1 hour, check production
4. Upgrade to Level 5 (+50% production)
5. Wait 1 hour, check production

**Expected Results:**
- ✅ Level 1: ~550 equipment/hour (50 × 1.10)
- ✅ Level 5: ~750 equipment/hour (50 × 1.50)
- ✅ Production increases with each citadel level

**ROI Calculation:**
- 10K colonists, Level 5 citadel, Equipment Focus
- Production: ~750 equipment/hour × ₡94 = ₡70,500/hour
- Citadel cost: ₡1,900,000
- Break-even: ~27 hours (was ~170 hours before buff)

---

## 5. Corporate Account Tests

### 5.1 Founder Withdrawal Limits
**Test:** Verify founder can withdraw unlimited

**Steps:**
1. Create corporation as founder
2. Deposit ₡1,000,000 to corporate account
3. Withdraw ₡500,000 as founder
4. Verify withdrawal succeeds

**Expected Results:**
- ✅ Withdrawal succeeds
- ✅ No limit error
- ✅ Corporate balance: ₡500,000 remaining

---

### 5.2 Member Withdrawal Limits
**Test:** Verify member limited to ₡10,000

**Steps:**
1. Have member rank in corporation
2. Corporate account has ₡100,000
3. Try to withdraw ₡15,000
4. Try to withdraw ₡10,000

**Expected Results:**
- ✅ Withdrawal of ₡15,000 fails: "Members can only withdraw up to ₡10,000"
- ✅ Withdrawal of ₡10,000 succeeds
- ✅ Withdrawal fee still applies (5%)

---

### 5.3 Officer Withdrawal Limits
**Test:** Verify officer limited to ₡100,000

**Steps:**
1. Have officer rank in corporation
2. Corporate account has ₡200,000
3. Try to withdraw ₡150,000
4. Try to withdraw ₡100,000

**Expected Results:**
- ✅ Withdrawal of ₡150,000 fails: "Officers can only withdraw up to ₡100,000"
- ✅ Withdrawal of ₡100,000 succeeds
- ✅ Withdrawal fee still applies (5%)

---

## 6. Ship Cost Verification

### 6.1 Ship Prices Match Documentation
**Test:** Verify ship costs are correct

**Steps:**
1. Go to StarDock
2. Check ship prices

**Expected Results:**
- ✅ Scout: ₡10,000 (was ₡1,000 - fixed)
- ✅ Trader: ₡50,000 (was ₡10,000 - fixed)
- ✅ Corporate Flagship: ₡500,000 (was ₡1,000,000 - fixed)

---

## 7. Integration Tests

### 7.1 Full Combat Flow
**Test:** Complete combat scenario with all fixes

**Steps:**
1. Player A: ₡20,000 on-hand, ₡30,000 in bank, 50 fighters, 50 shields
2. Player B: ₡10,000 on-hand, ₡20,000 in bank, 30 fighters, 30 shields
3. Player A attacks Player B
4. Player A wins (destroys Player B)
5. Check all results

**Expected Results:**
- ✅ Player A: Spent 1 turn
- ✅ Player A: Received ₡7,500 loot (75% of ₡10,000)
- ✅ Player B: Lost ₡2,500 on-hand (25% of ₡10,000)
- ✅ Player B: Lost ₡5,000 from bank (25% of ₡20,000)
- ✅ Player B: Respawned in escape pod
- ✅ Combat is profitable for Player A

---

### 7.2 Banking + Combat Interaction
**Test:** Verify banking restrictions work with combat

**Steps:**
1. Bank all credits before combat
2. Try to withdraw during combat (not at StarDock) - should fail
3. Die in combat
4. Check bank balance lost 25%
5. Respawn, go to StarDock
6. Withdraw credits (pay 5% fee)

**Expected Results:**
- ✅ Cannot withdraw when not at StarDock
- ✅ Bank balance loses 25% on death
- ✅ Withdrawal fee applies when withdrawing

---

## 8. Edge Cases

### 8.1 Zero Credits Maintenance
**Test:** Deploy fighters with 0 credits

**Steps:**
1. Have 0 credits
2. Deploy 1 fighter
3. Check if deployment succeeds

**Expected Results:**
- ✅ Deployment succeeds (no upfront cost)
- ✅ Warning shows "Daily maintenance: ₡5/day"
- ✅ Warning shows "⚠️ Insufficient funds!"
- ✅ Fighter will be destroyed on next maintenance tick

---

### 8.2 Maximum Fighter Deployment
**Test:** Deploy maximum fighters

**Steps:**
1. Have 500 fighters on ship
2. Deploy all 500 to one sector
3. Check deployment

**Expected Results:**
- ✅ All 500 deploy successfully
- ✅ Daily maintenance: ₡2,500/day
- ✅ Warning shows if credits < ₡2,500

---

## Testing Checklist Summary

- [ ] Banking: StarDock requirement enforced
- [ ] Banking: 5% withdrawal fee charged correctly
- [ ] Banking: 25% bank balance lost on death
- [ ] Combat: 1 turn cost per attack
- [ ] Combat: 75% loot percentage
- [ ] Combat: 25% death penalty (credits + bank)
- [ ] Combat: Profitable with new balance
- [ ] Fighters: Deployment works
- [ ] Fighters: Maintenance warning displayed
- [ ] Fighters: Daily maintenance charged
- [ ] Fighters: Destroyed when can't pay
- [ ] Planets: 5x production buff
- [ ] Planets: Citadel bonuses work
- [ ] Corporate: Founder unlimited withdrawals
- [ ] Corporate: Member ₡10K limit
- [ ] Corporate: Officer ₡100K limit
- [ ] Ships: Costs match documentation

---

## Notes

- **Daily Maintenance:** Runs every 24 hours. For testing, you may need to wait or temporarily adjust the interval.
- **Combat Testing:** Requires 2 players. Use 2 browser windows or coordinate with another tester.
- **Planet Production:** Wait 1 hour for production to accumulate, or check production calculation logic.
- **Banking:** All operations require StarDock location - verify UI hides banking when not at StarDock.

---

## Reporting Issues

If you find any issues during testing:
1. Note the exact steps to reproduce
2. Capture screenshots/error messages
3. Check browser console for errors
4. Check server logs for backend errors
5. Report with expected vs actual results


