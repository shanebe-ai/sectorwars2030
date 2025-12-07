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

## 9. Alien Combat Tests

### 9.1 Attack Alien Ship
**Test:** Player can attack alien ships

**Steps:**
1. Navigate to a sector with an alien ship
2. Verify alien ship is visible in sector details
3. Click "Attack" on the alien ship
4. Verify combat simulation runs
5. Check combat results displayed

**Expected Results:**
- ✅ Combat costs 1 turn
- ✅ Combat simulation shows rounds
- ✅ Winner determined (player or alien)
- ✅ Fighters and shields lost tracked accurately
- ✅ Alien ship destroyed if fighters reach 0
- ✅ Player loots 75% of alien credits on victory
- ✅ Alien comms broadcasts combat result

---

### 9.2 Alien Ship Victory
**Test:** Verify player receives loot when destroying alien

**Steps:**
1. Have 100 fighters, 50 shields
2. Attack an alien with 20 fighters, 10 shields
3. Win the combat
4. Check loot received

**Expected Results:**
- ✅ Alien ship removed from sector
- ✅ Player receives 75% of alien's credits
- ✅ Kill count incremented
- ✅ Alien comms shows destruction message
- ✅ Combat log shows all rounds

---

### 9.3 Player Death to Alien
**Test:** Verify death penalty when player loses to alien

**Steps:**
1. Have weak ship (10 fighters, 5 shields)
2. Attack strong alien (100 fighters, 50 shields)
3. Get destroyed by alien
4. Check respawn and penalties

**Expected Results:**
- ✅ Player respawns in Escape Pod
- ✅ 25% of on-hand credits lost
- ✅ 25% of bank balance lost
- ✅ Respawn in adjacent sector or Sol
- ✅ Death count incremented
- ✅ All cargo lost

---

### 9.4 Alien Combat Restrictions
**Test:** Verify combat restrictions apply

**Steps:**
1. Try to attack alien in TerraSpace (sectors 1-10)
2. Try to attack with 0 fighters
3. Try to attack with 0 turns

**Expected Results:**
- ✅ Cannot attack in TerraSpace (error message)
- ✅ Cannot attack without fighters (error message)
- ✅ Cannot attack without turns (error message)

---

### 9.5 Alien Communications Integration
**Test:** Verify alien comms integration

**Steps:**
1. Unlock alien communications
2. Attack and destroy an alien ship
3. Check alien comms feed

**Expected Results:**
- ✅ Combat event appears in alien comms
- ✅ Shows player username and alien race
- ✅ Shows sector number
- ✅ Timestamp is accurate

---

### 9.6 Attack Alien Planet
**Test:** Player can attack alien planets

**Steps:**
1. Navigate to a sector with an alien planet
2. Verify alien planet is visible in sector details
3. Click "Attack" on the alien planet
4. Verify combat simulation runs
5. Check combat results displayed

**Expected Results:**
- ✅ Combat costs 1 turn
- ✅ Combat simulation shows rounds
- ✅ Citadel level provides defense bonus (10% per level)
- ✅ Planet fighters are citadel-enhanced
- ✅ Winner determined (player or planet)
- ✅ Planet destroyed if fighters reach 0
- ✅ Player loots 75% of planet resources on victory
- ✅ Alien comms broadcasts combat result

---

### 9.7 Planet Victory Loot
**Test:** Verify player receives loot when destroying alien planet

**Steps:**
1. Have 200 fighters, 100 shields
2. Attack alien planet with 50 fighters, Citadel Level 2
3. Win the combat
4. Check loot received

**Expected Results:**
- ✅ Alien planet removed from sector
- ✅ Player receives 75% of planet's credits
- ✅ Player receives 75% of planet's fuel
- ✅ Player receives 75% of planet's organics
- ✅ Player receives 75% of planet's equipment
- ✅ Cargo respects ship holds max
- ✅ Kill count incremented
- ✅ Alien comms shows destruction message
- ✅ Combat log shows citadel-enhanced fighters

---

### 9.8 Player Death to Alien Planet
**Test:** Verify death penalty when player loses to planet

**Steps:**
1. Have weak ship (20 fighters, 10 shields)
2. Attack strong alien planet (200 fighters, Citadel Level 5)
3. Get destroyed by planetary defenses
4. Check respawn and penalties

**Expected Results:**
- ✅ Player respawns in Escape Pod
- ✅ 25% of on-hand credits lost
- ✅ 25% of bank balance lost
- ✅ Respawn in adjacent sector or Sol
- ✅ Death count incremented
- ✅ All cargo lost
- ✅ Planet fighters reduced by combat losses

---

### 9.9 Citadel Defense Bonus
**Test:** Verify citadel level increases planetary defense

**Steps:**
1. Attack planet with Citadel Level 0 (50 fighters base)
2. Note combat difficulty
3. Attack planet with Citadel Level 5 (50 fighters base)
4. Compare combat difficulty

**Expected Results:**
- ✅ Level 0: 50 fighters in combat
- ✅ Level 5: 75 fighters in combat (50 × 1.5)
- ✅ Higher citadel = more rounds of combat
- ✅ Combat log shows "(citadel-enhanced)"
- ✅ Citadel bonus: 10% per level

---

### 9.10 Planet Attack Restrictions
**Test:** Verify combat restrictions apply

**Steps:**
1. Try to attack planet in TerraSpace (sectors 1-10)
2. Try to attack with 0 fighters
3. Try to attack with 0 turns
4. Try to attack planet in different sector

**Expected Results:**
- ✅ Cannot attack in TerraSpace (error message)
- ✅ Cannot attack without fighters (error message)
- ✅ Cannot attack without turns (error message)
- ✅ Cannot attack planet from different sector (error message)

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
- [ ] Alien Combat: Can attack alien ships
- [ ] Alien Combat: Loot on victory (75%)
- [ ] Alien Combat: Death penalty on loss (25%)
- [ ] Alien Combat: Restrictions enforced
- [ ] Alien Combat: Comms integration works
- [ ] Alien Planets: Can attack alien planets
- [ ] Alien Planets: Loot on victory (75% resources)
- [ ] Alien Planets: Death penalty on loss (25%)
- [ ] Alien Planets: Citadel defense bonus (10% per level)
- [ ] Alien Planets: Restrictions enforced

---

## Notes

- **Daily Maintenance:** Runs every 24 hours. For testing, you may need to wait or temporarily adjust the interval.
- **Combat Testing:** Requires 2 players. Use 2 browser windows or coordinate with another tester.
- **Planet Production:** Wait 1 hour for production to accumulate, or check production calculation logic.
- **Banking:** All operations require StarDock location - verify UI hides banking when not at StarDock.

---

## 11. Corporation Management System Tests

### 11.1 View Corporation Panel
**Test:** Access corporation management interface

**Steps:**
1. Login as any player
2. Click the ★ CORP button in the header (yellow/gold colored)
3. Verify corporation panel opens

**Expected Results:**
- ✅ Panel opens as full-screen modal with cyberpunk styling
- ✅ Shows corporation name in header
- ✅ Shows corporation info (Founder, Members, Your Rank)
- ✅ Members tab displays all members with rank badges
- ✅ Founder shows ★ FOUNDER badge (yellow)
- ✅ Officers show ◆ OFFICER badge (cyan)
- ✅ Members show • MEMBER badge (white)
- ✅ Your own member entry is highlighted with cyan border

---

### 11.2 Invite Player to Corporation ✅ COMPLETED
**Test:** Founder/Officer invites a player

**Setup:** Need 2 players - Player A (founder/officer), Player B (not in corp or in different corp)

**Steps:**
1. Login as Player A (founder or officer)
2. Open corporation panel
3. Click INVITE tab
4. Enter Player B's username
5. Click SEND INVITATION
6. Login as Player B
7. Check inbox messages

**Expected Results:**
- ✅ Success message shows "Invitation sent to [username]"
- ✅ Player B receives inbox message with subject "Corporation Invitation"
- ✅ Message body shows corporation name and corp ID
- ✅ Message type is 'corp_invite'

**Edge Cases:**
- ❌ Member (not founder/officer) should NOT see INVITE tab
- ❌ Inviting player already in corp shows error "already in a corporation"
- ❌ Inviting non-existent username shows error "Player not found in this universe"

**✅ TESTED & WORKING** (2025-12-07)

---

### 11.3 Accept Corporation Invitation ✅ COMPLETED
**Test:** Player accepts invitation to join corporation

**Setup:** Player has received corp invitation (from test 11.2)

**Steps:**
1. Login as invited player
2. Open COMMS panel
3. Read the corp invitation message
4. Note the Corp ID from message body
5. Click ACCEPT button on invitation message
6. Refresh or check corporation panel

**Expected Results:**
- ✅ Success message "You have joined [CorpName]!"
- ✅ Player's corp_name updates to new corporation
- ✅ Player added to corp_members table with rank 'member'
- ✅ Corporation panel shows player as member
- ✅ Player now sees CORPORATE chat tab in messaging
- ✅ Invitation message auto-deleted after acceptance

**Edge Cases:**
- ❌ Accepting when already in corp shows error "already in a corporation"
- ❌ Accepting invalid corp ID shows error "Corporation not found"

**✅ TESTED & WORKING** (2025-12-07) - Invitation auto-delete added

---

### 11.4 Kick Member from Corporation
**Test:** Founder/Officer removes a member

**Setup:** 3 players - Player A (founder), Player B (officer), Player C (member)

**Steps:**
1. Login as Player A (founder)
2. Open corporation panel → Members tab
3. Find Player C in member list
4. Click KICK button next to Player C
5. Confirm the kick action
6. Check that Player C is removed from list
7. Login as Player C and verify they're no longer in corp

**Expected Results:**
- ✅ Confirmation dialog appears before kicking
- ✅ Success message: "[Username] has been removed from the corporation"
- ✅ Member disappears from member list
- ✅ Player C's corp_id set to NULL
- ✅ Player C receives inbox message "Removed from Corporation"
- ✅ corp_members record deleted for Player C

**Permission Tests:**
- ✅ Founder can kick officers and members
- ✅ Officer can kick members
- ❌ Officer CANNOT kick other officers (error: "Officers cannot kick other officers")
- ❌ Officer CANNOT kick founder (error: "Cannot kick the founder")
- ❌ Member CANNOT kick anyone (no kick buttons shown)

---

### 11.5 Promote Member to Officer ✅ COMPLETED
**Test:** Founder promotes member to officer rank

**Setup:** Player A (founder), Player B (member)

**Steps:**
1. Login as Player A (founder)
2. Open corporation panel → Members tab
3. Find Player B with • MEMBER badge
4. Click PROMOTE button next to Player B
5. Confirm promotion
6. Check Player B's rank badge updates

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ Success message: "[Username] is now an officer"
- ✅ Badge changes from • MEMBER to ◆ OFFICER (cyan)
- ✅ corp_members.rank updates to 'officer'
- ✅ Player B receives inbox message "Rank Changed" with new rank
- ✅ Player B can now invite players and kick members

**Edge Cases:**
- ❌ Officer trying to promote shows error "Only the founder can change member ranks"
- ❌ Promoting founder shows error "Cannot change founder rank"

**✅ TESTED & WORKING** (2025-12-07)

---

### 11.6 Demote Officer to Member ✅ COMPLETED
**Test:** Founder demotes officer to member rank

**Setup:** Player A (founder), Player B (officer)

**Steps:**
1. Login as Player A (founder)
2. Open corporation panel → Members tab
3. Find Player B with ◆ OFFICER badge
4. Click DEMOTE button next to Player B
5. Confirm demotion
6. Check Player B's rank badge updates

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ Success message: "[Username] is now a member"
- ✅ Badge changes from ◆ OFFICER to • MEMBER
- ✅ corp_members.rank updates to 'member'
- ✅ Player B receives inbox message "Rank Changed"
- ✅ Player B loses ability to invite/kick

**✅ TESTED & WORKING** (2025-12-07)

---

### 11.7 Transfer Corporation Ownership ✅ COMPLETED
**Test:** Founder transfers ownership to another member

**Setup:** Player A (founder), Player B (officer or member)

**Steps:**
1. Login as Player A (founder)
2. Open corporation panel → Members tab
3. Find Player B in member list
4. Click TRANSFER button next to Player B
5. Confirm transfer (shows warning about becoming officer)
6. Check rank badges update

**Expected Results:**
- ✅ Confirmation dialog with warning: "You will become an officer"
- ✅ Success message: "Ownership transferred to [Username]"
- ✅ Player A's badge changes to ◆ OFFICER
- ✅ Player B's badge changes to ★ FOUNDER (yellow)
- ✅ corporations.founder_id updates to Player B's ID
- ✅ Player B receives inbox message "Corporation Ownership Transferred"
- ✅ Player B now has full control (promote, demote, kick, transfer)

**Edge Cases:**
- ❌ Officer trying to transfer shows error "Only the founder can transfer ownership"
- ❌ Transferring to player not in corp shows error "not in your corporation"

**✅ TESTED & WORKING** (2025-12-07)

---

### 11.8 Leave Corporation ✅ COMPLETED
**Test:** Member/Officer leaves corporation

**Setup:** Player A (member or officer, NOT founder)

**Steps:**
1. Login as Player A
2. Open corporation panel
3. Click LEAVE CORPORATION button (red, at bottom)
4. Confirm leave action
5. Check corp panel closes or shows "not in corporation"

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ Success message: "You have left [CorpName]. Refreshing..."
- ✅ Player's corp_id set to NULL
- ✅ Player's corp_name set to NULL
- ✅ corp_members record deleted
- ✅ Page refreshes after 1.5 seconds
- ✅ Corp panel shows "not in a corporation" message

**Edge Cases:**
- ❌ Founder trying to leave shows error "Founder cannot leave. Transfer ownership first"
- ✅ After leaving, can accept new invitations to other corps

**✅ TESTED & WORKING** (2025-12-07)

---

### 11.9 Multiple Corporation Workflow
**Test:** End-to-end workflow with multiple corporations

**Setup:** 3 players in different initial corporations

**Steps:**
1. Player A (Corp Alpha founder) invites Player B
2. Player B leaves Corp Beta
3. Player B accepts invitation to Corp Alpha
4. Player A promotes Player B to officer
5. Player B invites Player C
6. Player C accepts invitation
7. Player A transfers ownership to Player B
8. Player B (now founder) promotes Player C to officer
9. Player B kicks Player A (now officer)

**Expected Results:**
- ✅ All operations succeed in sequence
- ✅ Final state: Corp Alpha has Player B (founder), Player C (officer)
- ✅ Player A is not in any corporation
- ✅ All players receive appropriate inbox notifications
- ✅ Corp member count updates correctly throughout

---

### 11.10 Corporation Permission Matrix
**Test:** Verify all permission rules

| Action | Founder | Officer | Member |
|--------|---------|---------|--------|
| View Members | ✅ | ✅ | ✅ |
| Invite Players | ✅ | ✅ | ❌ |
| Accept Invitations | ✅ | ✅ | ✅ |
| Kick Members | ✅ | ✅ | ❌ |
| Kick Officers | ✅ | ❌ | ❌ |
| Kick Founder | ❌ | ❌ | ❌ |
| Promote Member | ✅ | ❌ | ❌ |
| Demote Officer | ✅ | ❌ | ❌ |
| Transfer Ownership | ✅ | ❌ | ❌ |
| Leave Corporation | ❌* | ✅ | ✅ |

*Founder must transfer ownership before leaving

**Test Method:**
- Login as each rank
- Try each action
- Verify allowed actions succeed
- Verify forbidden actions show error or hide UI

---

### 11.11 Corporate Communications Broadcasts
**Test:** Verify corporation events are broadcast to corporate channel (and universe where applicable)

**Setup:** 2-3 players in the same corporation

**Corporation Events to Test:**
1. **Promote Member to Officer** ✅ (2025-12-07)
2. **Demote Officer to Member** ✅ (2025-12-07)
3. **Kick Member** ⏳
4. **Transfer Ownership** ✅ (2025-12-07)
5. **Leave Corporation** ✅ (2025-12-07)
6. **Accept Invitation / Join Corporation** ✅ (2025-12-07)
7. **Disband Corporation** ⏳

**Steps:**
1. Player A (founder) and Player B (member) are both in CorpName
2. Trigger an event (promotion, demotion, kick, transfer, leave, join, disband)
3. All members check CORPORATE tab in COMMS
4. Verify broadcast message appears once
5. For join/leave/kick/transfer/disband also verify universal TNN broadcast appears in BROADCAST tab with COMMS badge increment

**Expected Results (Corporate tab):**
- ✅ **Promote:** "PlayerB has been promoted to Officer by PlayerA" (single entry)
- ✅ **Demote:** "PlayerB has been demoted to Member by PlayerA" (single entry)
- ✅ **Kick:** "PlayerC has been removed from CorpName by PlayerA" (single entry)
- ✅ **Transfer:** "Ownership transferred from PlayerA to PlayerB" (single entry)
- ✅ **Leave:** "PlayerB has left the corporation" (single entry)
- ✅ **Join:** "PlayerB has joined the corporation" (single entry, sent before/when membership established)
- ✅ Messages appear in green CORPORATE theme with correct corp name (no "[Unknown Corp]")
- ✅ All corp members see the broadcast
- ✅ Messages show timestamp
- ✅ Messages persist for the corp; leavers/kicked members no longer see previous corp messages after removal

**Expected Results (Broadcast tab, TNN):**
- ✅ **Join:** "PlayerB has joined CorpName" (universe-wide)
- ✅ **Leave:** "PlayerB has left CorpName" (universe-wide)
- ✅ **Kick:** (optional per admin policy) not sent currently
- ✅ **Transfer:** "Ownership of CorpName transferred from PlayerA to PlayerB" (universe-wide)
- ✅ **Disband:** "CorpName has been disbanded by the founder." (universe-wide)
- ✅ Messages appear with sender "TerraCorp News Network" and trigger COMMS badge

**Edge Cases:**
- ✅ Only corp members see corporate broadcasts (not other players)
- ✅ Broadcasts appear immediately (no need to refresh)
- ✅ Leaving player's broadcast still visible to remaining members
- ✅ Leavers/kicked members no longer see prior corporate history after removal

---

## Testing Tips

- **Combat Testing:** Requires 2 players. Use 2 browser windows or coordinate with another tester.
- **Corporation Testing:** Requires 2-3 players for full testing. Use multiple browser windows (different users).
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


