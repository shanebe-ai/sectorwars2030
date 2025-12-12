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

- [x] Banking: StarDock requirement enforced ✅ TESTED 2025-12-07
- [x] Banking: 5% withdrawal fee charged correctly ✅ TESTED 2025-12-07
- [x] Banking: 25% bank balance lost on death ✅ TESTED 2025-12-07
- [x] Combat: 1 turn cost per attack ✅ TESTED 2025-12-07
- [x] Combat: 75% loot percentage ✅ TESTED 2025-12-07
- [x] Combat: 25% death penalty (credits + bank) ✅ TESTED 2025-12-07
- [x] Combat: Profitable with new balance ✅ TESTED 2025-12-07
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

## Known Issues (Minor UX)

1. **Inbox Notifications:** Real-time inbox badge does not update when receiving transfers. Badge updates when COMMS panel is opened or page is refreshed. (Low priority - functional, just not real-time)
2. **Escape Pod Messaging:** Message shows destination sector number (e.g., "Sector 64") which may be confused with jump distance. The actual jump distance is 1-3 sectors as designed. (Clarification needed in UI)

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

---

## 12. Alien System Tests (NEW - 2025-12-10)

### 12.1 Alien Generation - Universe Creation
**Test:** Verify aliens generate correctly when creating new universe

**Steps:**
1. Login as admin at http://localhost:5174
2. Click CREATE UNIVERSE
3. Create a 1000-sector universe (default settings)
4. Wait for universe generation to complete
5. Check database for alien planets and ships
6. Login as player and explore to find aliens

**Expected Results:**
- ✅ **0-49 sectors:** 0 alien planets, 1 alien ship
- ✅ **50-99 sectors:** 1 alien planet, 1-2 alien ships
- ✅ **100-499 sectors:** 1-2 alien planets, 3-4 alien ships
- ✅ **500-999 sectors:** 2-4 alien planets, 3-5 alien ships
- ✅ **1000+ sectors:** ~0.3% alien planets (~3 per 1000), 2-5 ships per planet

**Database Verification (PostgreSQL):**
```sql
-- Count alien planets
SELECT COUNT(*) FROM alien_planets WHERE universe_id = [UNIVERSE_ID];
-- Should be ~3 for 1000-sector universe

-- Count alien ships
SELECT COUNT(*) FROM alien_ships WHERE universe_id = [UNIVERSE_ID];
-- Should be 6-15 for 1000-sector universe

-- View alien distribution
SELECT race, ship_type, behavior, COUNT(*)
FROM alien_ships
WHERE universe_id = [UNIVERSE_ID]
GROUP BY race, ship_type, behavior;
```

**Alien Races to Verify:**
- Xenthi, Vorlak, Krynn, Sslith, Zendarr, Thorax, Quell, Nebari, Vedran, Pyrians

---

### 12.2 Alien Ship Detection in Sectors
**Test:** Verify alien ships appear in sector view

**Steps:**
1. Navigate universe looking for alien ships
2. When alien ship is detected, verify display
3. Check ship details (race, type, behavior, fighters, shields)

**Expected Results:**
- ✅ Alien ship shown in sector with distinct styling (purple/alien theme)
- ✅ Shows: Race name (e.g., "Vorlak"), ship type (e.g., "Merchant Cruiser")
- ✅ Shows: Behavior (patrol/trade/aggressive/defensive)
- ✅ Shows: Fighters and shields count
- ✅ "Attack" button available (disabled in TerraSpace or with 0 turns)
- ✅ Ship stats are 65-90% of ship type max values

**Example Display:**
```
👾 ALIEN SHIP DETECTED
   Race: Vorlak
   Ship: Merchant Cruiser
   Behavior: AGGRESSIVE
   Fighters: 112 | Shields: 98
   [ATTACK ALIEN SHIP]
```

---

### 12.3 Alien Planet Detection in Sectors
**Test:** Verify alien planets appear in sector view

**Steps:**
1. Navigate universe looking for alien planets (~3 in 1000 sectors)
2. When alien planet is detected, verify display
3. Check planet details and auto-unlock alien comms

**Expected Results:**
- ✅ Alien planet shown with distinct purple/alien theme
- ✅ Shows: Race name, planet type, citadel level
- ✅ Shows: Fighters count (1,000-2,000), colonists (50K-100K)
- ✅ "Attack" button available (disabled in TerraSpace)
- ✅ **Alien Comms Auto-Unlock:** Notification appears "Alien communications channel unlocked!"
- ✅ COMMS button badge increments (new channel available)
- ✅ Ship log auto-logs the alien planet with special marker

**Example Display:**
```
👾 ALIEN PLANET
   Race: Krynn
   Name: Krynn Outpost Delta-7
   Citadel: Level 3
   Fighters: 1,450 | Colonists: 75,000
   [ATTACK ALIEN PLANET]
```

---

### 12.4 Alien Communications Channel
**Test:** Verify alien comms channel works correctly

**Steps:**
1. Enter sector with alien planet (unlocks comms)
2. Open COMMS panel
3. Verify "Alien Comms" tab appears
4. Read messages in alien comms feed

**Expected Results:**
- ✅ New "ALIEN COMMS" tab in MessagingPanel (purple theme)
- ✅ Tab shows message count badge
- ✅ Messages are **read-only** (no compose option)
- ✅ Messages show:
  - Alien race name (color-coded)
  - Message content (combat, movement, encounters)
  - Sector number
  - Timestamp

**Message Types to Verify:**
- ✅ "Xenthi scout moving through sector [X]" (movement, 30% chance)
- ✅ "Vorlak battlecruiser attacking player [username] in sector [X]" (combat)
- ✅ "Player [username] destroyed Krynn merchant cruiser in sector [X]" (combat)
- ✅ "Sslith ship encountered player [username] in sector [X]" (encounters)
- ✅ "Thorax ship hit mines in sector [X], took [damage] damage" (mines)
- ✅ "Zendarr ship destroyed by deployed fighters in sector [X]" (fighters)

---

### 12.5 Attack Alien Ship - Victory
**Test:** Player destroys alien ship successfully

**Steps:**
1. Find alien ship in sector (preferably weak one)
2. Have strong ship (150+ fighters, 100+ shields)
3. Click "ATTACK ALIEN SHIP"
4. Watch combat simulation
5. Verify victory and loot

**Expected Results:**
- ✅ Combat costs **1 turn**
- ✅ Combat panel shows round-by-round simulation
- ✅ Damage randomness: 50-150% variance
- ✅ Critical hits: 10% chance (2x damage)
- ✅ Dodge chance: 15% (50% damage reduction)
- ✅ Shields absorb damage first (2 damage per shield)
- ✅ **Victory:** Alien ship destroyed message
- ✅ **Loot:** Receive 75% of alien's credits (if any)
- ✅ **Kill count** incremented
- ✅ Alien ship removed from sector
- ✅ **Alien Comms Broadcast:** "Player [username] destroyed [race] [ship] in sector [X]"
- ✅ Combat panel closes after dismissal
- ✅ Sector refreshes to show alien gone

---

### 12.6 Attack Alien Ship - Defeat
**Test:** Player loses to alien ship

**Steps:**
1. Find strong alien ship (aggressive with high stats)
2. Have weak ship (20 fighters, 10 shields)
3. Attack alien ship
4. Get destroyed by alien

**Expected Results:**
- ✅ Combat simulation shows you losing
- ✅ **Player Death:** "Your ship was DESTROYED!" message
- ✅ **Respawn:** In Escape Pod (5 holds, 0 fighters/shields)
- ✅ **Respawn Location:** Random sector 1-3 jumps away OR Sol if isolated
- ✅ **Death Penalty:** Lose 25% of on-hand credits
- ✅ **Bank Penalty:** Lose 25% of bank balance
- ✅ **Cargo Lost:** All fuel/org/equip lost
- ✅ **Colonists Lost:** All colonists lost
- ✅ **Mines/Beacons/Genesis Lost:** All zeroed
- ✅ **Death count** incremented
- ✅ **Alien Comms Broadcast:** "[Race] [ship] destroyed player [username]'s ship in sector [X]"
- ✅ Respawn in escape pod message shown clearly

---

### 12.7 Attack Alien Planet - Victory
**Test:** Player destroys alien planet successfully

**Steps:**
1. Find alien planet in sector
2. Have very strong ship (250+ fighters, 200+ shields)
3. Click "ATTACK ALIEN PLANET"
4. Watch combat simulation
5. Verify victory and massive loot

**Expected Results:**
- ✅ Combat costs **1 turn**
- ✅ Combat simulation shows citadel-enhanced fighters
- ✅ **Citadel Bonus:** Planet fighters = base × (1 + 0.1 × citadel_level)
  - Example: Level 3 citadel = 30% more fighters
- ✅ Combat shows "(citadel-enhanced)" tag
- ✅ **Victory:** Alien planet destroyed message
- ✅ **Loot - Credits:** 75% of planet's stored credits
- ✅ **Loot - Resources:** 75% of fuel/org/equip (up to cargo capacity)
- ✅ **Excess Cargo:** Floats in sector if ship full
- ✅ **Kill count** incremented
- ✅ Alien planet removed from database
- ✅ **Alien Comms Broadcast:** "Player [username] destroyed [race] planet in sector [X]"

**Loot Calculation Example:**
- Alien planet has: 5,000 fuel, 3,000 organics, 2,000 equipment, 100,000 credits
- Player gets 75%: 3,750 fuel, 2,250 organics, 1,500 equipment, 75,000 credits
- Ship capacity: 250 holds
- Can carry: Mix of commodities up to 250 units
- **Excess:** Remaining resources float in sector as sector_cargo

---

### 12.8 Attack Alien Planet - Defeat
**Test:** Player loses to alien planet defenses

**Steps:**
1. Find heavily defended alien planet (Level 4-5 citadel, 1500+ fighters)
2. Have weak ship (50 fighters, 30 shields)
3. Attack planet
4. Get destroyed by planetary defenses

**Expected Results:**
- ✅ Combat simulation shows overwhelming alien defense
- ✅ **Player Death:** Same death penalty as alien ship combat
- ✅ **Respawn:** Escape Pod in random sector 1-3 jumps away
- ✅ **Credits Lost:** 25% on-hand + 25% bank balance
- ✅ **Cargo Lost:** All resources lost
- ✅ **Planet Survives:** Alien planet fighters reduced but still standing
- ✅ **Alien Comms Broadcast:** "[Race] planet defenses destroyed player [username]'s ship in sector [X]"

---

### 12.9 Alien Ship AI Movement
**Test:** Verify alien ships move automatically

**Setup:** Requires waiting or monitoring alien ship positions

**Steps:**
1. Note the sector number of an alien ship with "patrol" behavior
2. Wait 5 minutes (alien ship movement interval)
3. Check if alien ship has moved to adjacent sector
4. Repeat observation

**Expected Results:**
- ✅ **Patrol behavior:** Moves to random adjacent sector every 5 minutes
- ✅ **Trade behavior:** Moves between port sectors
- ✅ **Aggressive behavior:** Patrols actively
- ✅ **Defensive behavior:** Stays near home alien planet
- ✅ **Alien Comms Broadcast:** 30% chance of movement broadcast
  - "[Race] [ship] moving through sector [X]"

**Testing AI Systems:**
- Check server logs for "Alien ship movement tick" messages
- Verify no crashes during alien movement
- Verify aliens don't get stuck in infinite loops

---

### 12.10 Alien Ship vs Deployed Fighters
**Test:** Verify aliens encounter player-deployed fighters

**Steps:**
1. Deploy 100 fighters in a sector
2. Wait for alien ship to move into that sector
3. Check inbox for notification

**Expected Results:**
- ✅ **Alien Evaluation:** If alien strength < 50% of fighter strength, alien **retreats**
- ✅ **Retreat Notification:** Owner receives inbox message "Alien Retreat - Sector [X]"
- ✅ **Alien Comms Broadcast:** "[Race] [ship] retreated from deployed fighters in sector [X]"
- ✅ **Fight:** If alien is strong enough, they **attack**
- ✅ **Combat:** Simple damage calculation (fighters deal damage equal to count)
- ✅ **Combat Result:** Fighters destroyed, alien loses shields/fighters
- ✅ **Owner Notification:** Detailed combat report via inbox
- ✅ **Alien Comms Broadcast:** Combat outcome (alien destroyed or fighters destroyed)

---

### 12.11 Alien Ship vs Mines
**Test:** Verify aliens trigger mines when entering sectors

**Steps:**
1. Deploy 10 mines in a sector
2. Wait for alien ship to move into that sector
3. Check alien comms and mine status

**Expected Results:**
- ✅ **Mine Triggering:** 20-90% chance per mine to explode
- ✅ **Damage:** 75-225 damage per mine (base 150 × 0.5-1.5 variance)
- ✅ **Shields First:** Alien shields absorb damage before fighters
- ✅ **Mine Destruction:** Exploded mines are removed
- ✅ **Alien Survival:** Alien ship continues if fighters > 0
- ✅ **Alien Death:** Alien ship destroyed if fighters reach 0
- ✅ **Alien Comms Broadcast:**
  - "[Race] [ship] hit mines in sector [X], took [damage] damage"
  - OR "[Race] [ship] destroyed by mines in sector [X]"
- ✅ **Owner Notification:** Mine owner receives inbox message if alien destroyed

---

### 12.12 Alien Ship Aggression System
**Test:** Verify aggressive aliens attack players

**Setup:** Requires waiting 10 minutes (aggression tick interval)

**Steps:**
1. Have a player in same sector as "aggressive" alien ship
2. Wait 10 minutes for aggression tick
3. Check if combat occurred

**Expected Results:**
- ✅ **Aggression Check:** Every 10 minutes, aggressive aliens scan sector for players
- ✅ **Combat Initiation:** Aggressive alien attacks player in same sector
- ✅ **Combat Simulation:** Same mechanics as player-initiated combat
- ✅ **Player Notification:** Inbox message "⚠️ Alien Attack! [Race] [ship] attacked you in sector [X]"
- ✅ **Combat Result:** Either player or alien destroyed
- ✅ **Alien Comms Broadcast:** Combat outcome
- ✅ **Death Penalty:** Player loses 25% credits if destroyed

**Testing AI Aggression:**
- Check server logs for "Alien aggression tick" messages
- Verify only "aggressive" behavior aliens attack
- Verify "patrol"/"trade"/"defensive" aliens don't attack unprovoked

---

### 12.13 Alien Ship Stats Verification
**Test:** Verify alien ships have correct stat ranges

**Steps:**
1. Find multiple alien ships of same type (e.g., "Merchant Cruiser")
2. Note their fighter and shield counts
3. Check against ship type maximum values

**Expected Results:**
- ✅ Alien ships have **65-90% of ship type max** fighters/shields
- ✅ **Example:** Merchant Cruiser max = 150 fighters, 150 shields
  - Alien should have: 98-135 fighters, 98-135 shields
- ✅ Stats are randomized within range
- ✅ Different aliens of same ship type have different stats

**Stat Verification (via database):**
```sql
SELECT
  a.race,
  a.ship_type,
  a.fighters,
  a.shields,
  st.fighters_max,
  st.shields_max,
  ROUND((a.fighters::numeric / st.fighters_max) * 100, 1) as fighter_pct,
  ROUND((a.shields::numeric / st.shields_max) * 100, 1) as shield_pct
FROM alien_ships a
JOIN ship_types st ON a.ship_type = st.name
WHERE a.universe_id = [UNIVERSE_ID];
-- fighter_pct and shield_pct should be 65-90%
```

---

### 12.14 Alien System Performance
**Test:** Verify alien systems don't cause lag or crashes

**Steps:**
1. Create large universe (2000+ sectors)
2. Generate aliens (~6 planets, 12-30 ships)
3. Let game run for 1+ hour
4. Monitor server performance and logs

**Expected Results:**
- ✅ No server crashes during alien movement ticks
- ✅ No database deadlocks during alien combat
- ✅ Alien movement completes within ~5 seconds per tick
- ✅ Alien aggression completes within ~10 seconds per tick
- ✅ No infinite loops or stuck aliens
- ✅ Server memory usage stable (no leaks)
- ✅ Database query performance acceptable

**Performance Monitoring:**
- Check server CPU usage during ticks
- Check PostgreSQL active queries: `SELECT * FROM pg_stat_activity;`
- Monitor for "idle in transaction" queries (indicates deadlock)
- Check alien_communications table size doesn't explode

---

### 12.15 Edge Cases - Alien System

**Test 1: Alien in TerraSpace**
- ✅ Aliens should NOT generate in sectors 1-10 (safe zone)
- ✅ Cannot attack aliens in TerraSpace (error message)

**Test 2: Player in Escape Pod vs Alien**
- ✅ Player in escape pod should see warning when trying to attack
- ✅ Error: "Cannot attack while in Escape Pod"

**Test 3: Zero Turns vs Alien**
- ✅ Cannot attack alien with 0 turns
- ✅ Error: "Not enough turns"

**Test 4: Alien Ship Destroyed Mid-Combat**
- ✅ If alien ship moves/destroyed before attack, show error
- ✅ "Alien ship no longer in sector"

**Test 5: Multiple Players Attack Same Alien**
- ✅ First attack locks alien (SKIP LOCKED in database)
- ✅ Second player gets error "Alien is currently engaged in combat"

**Test 6: Alien Communications Without Unlock**
- ✅ Alien Comms tab should NOT appear if never visited alien planet
- ✅ After visiting alien planet, tab appears permanently

---

## 13. Genesis Torpedo System Tests (NEW - 2025-12-10)

### 13.1 Purchase Genesis Torpedoes
**Test:** Buy genesis torpedoes at StarDock

**Steps:**
1. Navigate to any StarDock sector
2. Open StarDock panel
3. Go to Equipment tab
4. Find "Genesis Torpedoes" section
5. Purchase 1 torpedo (₡50,000)

**Expected Results:**
- ✅ Costs ₡50,000 per torpedo
- ✅ Credits deducted correctly
- ✅ `ship_genesis` count increments
- ✅ Cannot buy if credits < ₡50,000
- ✅ Cannot buy if at max capacity (varies by ship)
- ✅ Success message shows new count

**Capacity by Ship:**
- Scout: 5 genesis torpedoes max
- Trader: 10
- Freighter: 15
- Merchant Cruiser: 20
- Corporate Flagship: 25

---

### 13.2 Launch Genesis Torpedo - Success
**Test:** Successfully create a new planet with genesis torpedo

**Steps:**
1. Navigate to an empty sector (no port, no planet)
2. Sector must be outside TerraSpace (sector 11+)
3. Have at least 1 genesis torpedo
4. Click "LAUNCH GENESIS" button
5. Confirm launch

**Expected Results:**
- ✅ Costs **1 turn** to launch
- ✅ Genesis torpedo count decrements by 1
- ✅ **New Planet Created:**
  - Random name (e.g., "New Prime", "Genesis Station", "Nova Colony")
  - Unclaimed (owner_id = NULL)
  - Sector number = current sector
  - Created by player tracked in database
- ✅ **TNN Broadcast:** "TerraCorp News Network: Player [username] deployed a Genesis Torpedo in Sector [X], creating [Planet Name]!"
- ✅ **Ship Log:** Auto-logs the new planet
- ✅ Planet appears in sector view immediately
- ✅ Can claim planet after creation

---

### 13.3 Launch Genesis Torpedo - Restrictions
**Test:** Verify launch restrictions are enforced

**Restriction Tests:**

**Test 3a: Launch in TerraSpace (sectors 1-10)**
- ✅ "LAUNCH GENESIS" button does NOT appear
- ✅ If forced via API: Error "Cannot launch Genesis Torpedoes in TerraSpace"

**Test 3b: Launch in Port Sector**
- ✅ Button does NOT appear in port sectors
- ✅ Error: "Cannot launch in port sectors"

**Test 3c: Launch in Sector with Existing Planet**
- ✅ Button does NOT appear if planet exists
- ✅ Error: "Sector already has a planet"

**Test 3d: Launch with 0 Torpedoes**
- ✅ Button appears grayed/disabled
- ✅ Error: "No Genesis Torpedoes available"

**Test 3e: Launch with 0 Turns**
- ✅ Button appears grayed/disabled
- ✅ Error: "Not enough turns"

---

### 13.4 Genesis Torpedo - UI Integration
**Test:** Verify UI shows genesis torpedo info correctly

**Steps:**
1. Check GameDashboard header shows genesis count
2. Check StarDock Equipment tab shows capacity
3. Check SectorView shows launch button when applicable

**Expected Results:**
- ✅ **GameDashboard:** Shows "Genesis: 3/5" (current/max)
- ✅ **StarDock Equipment:** Shows current count, max capacity, price
- ✅ **SectorView:** "LAUNCH GENESIS" button appears in valid sectors
- ✅ Button styling: Purple/special theme (genesis is special)
- ✅ Tooltip or description explains what genesis does

---

### 13.5 Genesis Torpedo - Planet Claiming
**Test:** Verify newly created planets can be claimed

**Steps:**
1. Launch genesis torpedo to create planet
2. View sector, see new planet
3. Click "CLAIM PLANET" button
4. Verify planet is now yours

**Expected Results:**
- ✅ New planet shows as "Unclaimed"
- ✅ CLAIM button available
- ✅ Claiming costs 0 credits (free)
- ✅ After claim: Planet owner is you
- ✅ Can set production type, deposit colonists, etc.
- ✅ Planet appears in "My Planets" list

---

### 13.6 Genesis Torpedo - Death Penalty
**Test:** Verify genesis torpedoes lost on death

**Steps:**
1. Have 5 genesis torpedoes on ship
2. Get destroyed in combat (player or alien)
3. Respawn in Escape Pod
4. Check genesis count

**Expected Results:**
- ✅ All genesis torpedoes lost (ship_genesis = 0)
- ✅ Respawn shows 0/0 genesis (Escape Pod has 0 capacity)

---

### 13.7 Genesis Torpedo - Ship Upgrade Transfer
**Test:** Verify genesis transfers when upgrading ships

**Steps:**
1. Have Scout with 3 genesis torpedoes (max 5)
2. Upgrade to Trader (max 10)
3. Check genesis count after upgrade

**Expected Results:**
- ✅ Genesis torpedoes transfer to new ship
- ✅ Count preserved: 3/10 genesis on Trader
- ✅ No loss during transfer

**Edge Case: Downgrade**
- Have Corporate Flagship with 25 genesis
- "Downgrade" to Scout (max 5)
- ✅ Only 5 genesis transfer (excess 20 lost)
- ⚠️ Warning message before upgrade: "Excess genesis will be discarded"

---

### 13.8 Genesis Torpedo - Strategic Uses
**Test:** Real-world strategic applications

**Scenario 1: Remote Planet Creation**
1. Find deep-space empty sector (500+ jumps from Sol)
2. Launch genesis torpedo
3. Claim planet
4. Build secret production base

**Expected Results:**
- ✅ Planet created in remote location
- ✅ Other players unlikely to find it
- ✅ Can colonize and produce resources safely

**Scenario 2: Territory Expansion**
1. Corporation controls sector cluster
2. Launch genesis in strategic sector
3. Claim and fortify with citadel + fighters
4. Control more territory

**Expected Results:**
- ✅ New planet adds territory control
- ✅ Can deploy fighters to defend cluster
- ✅ Strategic choke point created

**Scenario 3: Trade Hub Creation**
1. Find sector equidistant from 3+ ports
2. Launch genesis
3. Use as colonist/cargo storage hub
4. Optimize trade routes

**Expected Results:**
- ✅ Planet acts as intermediate storage
- ✅ Can deposit cargo mid-route
- ✅ Withdraw resources as needed

---

## Testing Checklist Summary - Alien & Genesis Systems

### Alien System
- [ ] Alien generation (planets & ships scale with universe size)
- [ ] Alien ships appear in sectors correctly
- [ ] Alien planets appear and auto-unlock comms
- [ ] Alien communications channel displays messages
- [ ] Attack alien ship - victory (75% loot)
- [ ] Attack alien ship - defeat (25% death penalty)
- [ ] Attack alien planet - victory (75% resources + credits)
- [ ] Attack alien planet - defeat (25% death penalty)
- [ ] Alien ship AI movement (patrol/trade/aggressive/defensive)
- [ ] Alien ships vs deployed fighters (retreat/combat)
- [ ] Alien ships vs mines (trigger and damage)
- [ ] Alien aggression system (attack players every 10min)
- [ ] Alien ship stats (65-90% of max)
- [ ] Performance (no crashes, no deadlocks)
- [ ] Edge cases (TerraSpace, escape pod, zero turns)

### Genesis Torpedo System
- [ ] Purchase at StarDock (₡50,000)
- [ ] Launch in valid sector (creates planet)
- [ ] Restrictions enforced (TerraSpace, ports, existing planets)
- [ ] TNN broadcast on planet creation
- [ ] UI shows genesis count correctly
- [ ] Newly created planets can be claimed
- [ ] Genesis lost on death
- [ ] Genesis transfers on ship upgrade
- [ ] Strategic uses verified

---



---

## Trading Systems Tests (Phase 1 & Phase 2)

### Added: 2025-12-12

This section covers manual testing for the Alien Trading System (Phase 1) and Player-to-Player Trading System (Phase 2).

---

## Phase 1: Alien Trading System

### Test: Generate Alien Trade Offer

**Steps:**
1. Navigate to a sector with a trade alien (behavior = 'trade')
2. Click the **TRADE** button next to the alien ship
3. Verify offer displays:
   - Alien name, race, alignment
   - What alien offers (fuel/organics/equipment/credits)
   - What alien requests
   - Price modifier (0.9-1.1 based on alignment 50-150)
   - 5-minute countdown timer

**Expected Results:**
- ✅ Modal opens with bidirectional trade offer
- ✅ Price modifier reflects alignment (100+ = better prices)
- ✅ Timer counts down from 5:00

---

### Test: Accept Alien Trade

**Steps:**
1. Have active alien trade offer
2. Ensure sufficient credits/cargo space
3. Click **ACCEPT**
4. Verify inventory updates

**Expected Results:**
- ✅ Trade completes successfully
- ✅ Credits/cargo updated correctly
- ✅ Offer status = 'accepted'
- ✅ History logged

**Edge Cases:**
- ❌ Insufficient credits → Error
- ❌ Insufficient cargo → Error
- ❌ Expired offer → Error

---

### Test: Rob Alien Trade (20% Success)

**Steps:**
1. Have active alien offer
2. Click **ROB (20%)**
3. Confirm warning
4. Observe outcome:
   - 20%: Robbery success → goods stolen
   - 80%: Combat initiated

**Expected Results (Success):**
- ✅ Stolen goods added to inventory
- ✅ Offer status = 'robbed'
- ✅ History: 'robbed_success'

**Expected Results (Combat):**
- ✅ Combat modal appears
- ✅ Combat results displayed
- ✅ History: 'robbed_failed'

**Statistical:** Run 10 attempts → ~2 successes, ~8 combat

---

### Test: Alien Offer Expiry (5 Minutes)

**Steps:**
1. Generate trade offer
2. Wait 5 minutes OR manually expire via database
3. Try to accept expired offer

**Expected Results:**
- ✅ Error: "Trade offer has expired"
- ✅ Auto-expired by cron job (runs every 1 minute)

**Database Check:**
```sql
-- Manually expire for testing
UPDATE alien_trade_offers
SET expires_at = NOW() - INTERVAL '1 hour'
WHERE id = <offer_id>;
```

---

## Phase 2: Player-to-Player Trading

### Test: Access Trade Inbox/Outbox

**Steps:**
1. Log in to any sector
2. Locate **📬 TRADE INBOX** button in action menu
3. Click to open inbox modal
4. Close and click **📤 TRADE OUTBOX**
5. Verify outbox modal opens

**Expected Results:**
- ✅ Both buttons visible
- ✅ Inbox shows received offers
- ✅ Outbox shows sent offers

---

### Test: Create P2P Trade Offer (Same Sector Required)

**Prerequisites:**
- Player 1 in sector 10
- Player 2 in sector 10 (same sector!)

**Steps (as Player 1):**
1. Find Player 2's ship in sector
2. Click **TRADE** button next to their ship
3. TradeOfferModal opens
4. Fill offer:
   - You Offer: 1000 fuel, 500 credits
   - You Request: 800 organics, 100 equipment
   - Message: "Fair trade!"
5. Click **Create Offer**

**Expected Results:**
- ✅ Split panel UI (You Offer | You Request)
- ✅ Real-time validation (can't offer more than you have)
- ✅ Submit disabled if invalid
- ✅ Success message on creation
- ✅ Appears in Player 1's outbox
- ✅ Appears in Player 2's inbox
- ✅ WebSocket notification to Player 2

**Edge Cases:**
- ❌ No offers → Error
- ❌ No requests → Error
- ❌ Exceed inventory → Error
- ❌ Different sectors → Error
- ❌ 11th pending offer → Error (max 10)

---

### Test: Accept P2P Trade (Same Sector Validation)

**Steps (as Player 2):**
1. Open **📬 TRADE INBOX**
2. View offer from Player 1
3. Verify details displayed
4. Check resource availability (green/red text)
5. Ensure both players still in sector 10
6. Click **ACCEPT**

**Expected Results:**
- ✅ Bidirectional transfer:
  - Player 1: -1000 fuel, -500 credits, +800 organics, +100 equipment
  - Player 2: +1000 fuel, +500 credits, -800 organics, -100 equipment
- ✅ Offer status = 'accepted'
- ✅ Removed from inbox/outbox
- ✅ History logged
- ✅ WebSocket notifications to both

**Edge Cases:**
- ❌ Insufficient resources → Error
- ❌ Cargo space full → Error
- ❌ Players in different sectors → Error
- ❌ Expired (24h) → Error

---

### Test: Different Sector Prevention

**Steps:**
1. Player 1 in sector 10
2. Player 2 in sector 15
3. Try to create offer

**Expected Results:**
- ✅ Error: "Both players must be in the same sector"

**Alternative:**
1. Create offer when both in sector 10
2. Player 1 moves to sector 15
3. Player 2 tries to accept
4. Error: "Players must be in the same sector to complete trade"

---

### Test: Rob P2P Trade (25% Success, Corp Protection)

**Prerequisites:**
- Player 1 created offer to Player 2
- Player 3 in same sector (NOT in same corp as Player 1)

**Steps (as Player 3):**
1. View offer in sector
2. Click **ROB (25%)**
3. Confirm warning: "Corporation members CANNOT rob each other"
4. Observe outcome:
   - 25%: Robbery success → stolen goods
   - 75%: Combat initiated

**Expected Results (Success):**
- ✅ Player 3 receives offered goods
- ✅ Offer status = 'robbed'
- ✅ History: 'robbed_success'
- ✅ Notifications to both players

**Expected Results (Combat):**
- ✅ Combat between Player 3 and Player 1
- ✅ Offer status = 'robbed'
- ✅ History: 'robbed_failed'
- ✅ Note: -20% penalty not yet in combat service

**Statistical:** Run 12 attempts → ~3 successes, ~9 combat

---

### Test: Corporation Member Protection

**Prerequisites:**
- Corp "TestCorp" exists
- Player 1 in TestCorp
- Player 2 in TestCorp
- Player 1 creates offer to Player 3 (not in corp)

**Steps (as Player 2):**
1. Try to rob Player 1's offer
2. Observe error

**Expected Results:**
- ✅ Error: "Cannot rob corporation members"
- ✅ Robbery blocked
- ✅ No combat
- ✅ Offer remains pending

---

### Test: Cancel P2P Offer

**Test A: Initiator Cancels**

**Steps (as Player 1):**
1. Open **📤 TRADE OUTBOX**
2. Find pending offer
3. Click **Cancel Offer**
4. Confirm

**Expected Results:**
- ✅ Status = 'cancelled'
- ✅ Removed from outbox
- ✅ Player 2's inbox updated
- ✅ History logged
- ✅ Notification to Player 2

**Test B: Recipient Rejects**

**Steps (as Player 2):**
1. Open **📬 TRADE INBOX**
2. Click **Reject** on offer
3. Confirm

**Expected Results:**
- ✅ Same as above
- ✅ Notification to Player 1

---

### Test: P2P Offer Expiry (24 Hours)

**Steps:**
1. Create trade offer
2. Wait 24 hours OR manually expire via database
3. Try to accept

**Expected Results:**
- ✅ Error: "Trade offer has expired"
- ✅ Auto-expired by cron job

**Database Check:**
```sql
-- Manually expire for testing
UPDATE player_trade_offers
SET expires_at = NOW() - INTERVAL '25 hours'
WHERE id = <offer_id>;

-- Run cleanup
SELECT expire_player_trade_offers();
```

---

### Test: Max 10 Pending Offers Limit

**Steps:**
1. Create 10 pending offers
2. Try to create 11th offer

**Expected Results:**
- ✅ First 10 succeed
- ✅ 11th rejected
- ✅ Error: "Maximum 10 pending offers reached"

---

### Test: XSS Sanitization

**Steps:**
1. Create offer with message: `<script>alert('XSS')</script>Test`
2. Submit
3. View in recipient's inbox

**Expected Results:**
- ✅ Script tags removed/sanitized
- ✅ No JavaScript execution
- ✅ Max 500 chars enforced

---

### Test: WebSocket Real-Time Notifications

**Setup:** Two browser windows

**Steps:**
1. Window 1 (Player 1): Create offer to Player 2
2. Window 2 (Player 2): Observe notification
3. Window 2: Accept trade
4. Window 1: Observe completion notification

**Expected Results:**
- ✅ `player_trade_offer_received` event fires
- ✅ `player_trade_completed` event fires
- ✅ UI updates in real-time
- ✅ Inbox/outbox counts update

---

### Test: Cargo Space Validation

**Steps:**
1. Player 1 has nearly full cargo
2. Create offer requesting large goods amount
3. Player 2 tries to accept

**Expected Results:**
- ✅ Error: "You would exceed your cargo capacity"
- ✅ Trade blocked

---

## Database Integrity Tests

### Test: Database Constraints

```sql
-- Cannot create offer to yourself
INSERT INTO player_trade_offers (
  universe_id, initiator_player_id, recipient_player_id, sector_id,
  initiator_offers_fuel, initiator_requests_fuel, expires_at
) VALUES (1, 1, 1, 10, 100, 100, NOW() + INTERVAL '24 hours');
-- Expected: ERROR - "different_players" constraint

-- Must have at least one offer
INSERT INTO player_trade_offers (
  universe_id, initiator_player_id, recipient_player_id, sector_id,
  initiator_requests_fuel, expires_at
) VALUES (1, 1, 2, 10, 100, NOW() + INTERVAL '24 hours');
-- Expected: ERROR - "has_offers" constraint

-- Must have at least one request
INSERT INTO player_trade_offers (
  universe_id, initiator_player_id, recipient_player_id, sector_id,
  initiator_offers_fuel, expires_at
) VALUES (1, 1, 2, 10, 100, NOW() + INTERVAL '24 hours');
-- Expected: ERROR - "has_requests" constraint
```

---

## Test Data Cleanup

```sql
-- Clean up P2P trades
DELETE FROM player_trade_offers WHERE universe_id = 1;
DELETE FROM player_trade_history WHERE universe_id = 1;

-- Clean up alien trades
DELETE FROM alien_trade_offers WHERE universe_id = 1;
DELETE FROM alien_trade_history WHERE universe_id = 1;

-- Reset player inventories
UPDATE players SET
  credits = 10000,
  fuel = 50,
  organics = 50,
  equipment = 50
WHERE id IN (1, 2, 3);
```

---

## Trading Systems Success Criteria

✅ All alien trading tests pass (Phase 1)
✅ All P2P trading tests pass (Phase 2)
✅ Same-sector validation enforced
✅ Corporation protection works
✅ WebSocket notifications functional
✅ No race conditions
✅ Database constraints enforced
✅ UI/UX intuitive and responsive
✅ Error messages clear and helpful

---

**Trading Systems Completed:** 2025-12-12
**Version:** Phase 1 & Phase 2 Complete
