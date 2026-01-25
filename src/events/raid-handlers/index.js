// ═══════════════════════════════════════════════════════════════
// RAID HANDLERS INDEX
// Export all raid-related handlers from one place
// ═══════════════════════════════════════════════════════════════

const { 
  handleBackToMain,
  handleRosterMenu,
  handlePresetMenu,
  handleLockUnlockMenu,
  handleManagementMenu,
  handleQuickStart,
  handleQuickComplete,
  handleQuickEdit,
  handleEditRaidSelect
} = require('./main-menu');
const { showSetupModal, handleSetupModal } = require('./setup-handlers');
const { 
  startCreateFlow, 
  handleNameModal,
  handleDateButton,
  handleDateModal, 
  handleTimeSelect, 
  handleSizeSelect, 
  handleChannelSelect 
} = require('./create-handlers');
const { showStartRaidSelector, handleStartSelect } = require('./start-handlers');
const { handleRaidAction } = require('./action-handlers');
const { 
  handleEditSelect, 
  handleDeleteSelect, 
  handleDeleteConfirm,
  handleEditPresetName,
  handleEditPresetNameModal,
  handleEditPresetTime,
  handleEditPresetTimeModal,
  handleEditPresetChannel,
  handleEditPresetChannelSelect,
  handleEditRaidName,
  handleEditRaidNameModal,
  handleEditRaidTime,
  handleEditRaidTimeModal
} = require('./edit-delete-handlers');

module.exports = {
  // Main menu handlers
  handleBackToMain,
  handleRosterMenu,
  handlePresetMenu,
  handleLockUnlockMenu,
  handleManagementMenu,
  handleQuickStart,
  handleQuickComplete,
  handleQuickEdit,
  handleEditRaidSelect,
  
  // Setup
  handleSetupModal,
  
  // Create flow
  handleNameModal,
  handleDateButton,
  handleDateModal,
  handleTimeSelect,
  handleSizeSelect,
  handleChannelSelect,
  
  // Edit/Delete - ✅ NOW EXPORTED
  handleEditSelect,
  handleDeleteSelect,
  handleDeleteConfirm,
  handleEditPresetName,
  handleEditPresetNameModal,
  handleEditPresetTime,
  handleEditPresetTimeModal,
  handleEditPresetChannel,
  handleEditPresetChannelSelect,
  handleEditRaidName,
  handleEditRaidNameModal,
  handleEditRaidTime,
  handleEditRaidTimeModal,
  
  // Start
  handleStartSelect,
  
  // Actions (lock/unlock/complete/cancel/repost/refresh)
  handleRaidAction
};
