// ═══════════════════════════════════════════════════════════════
// RAID HANDLERS INDEX
// Export all raid-related handlers from one place
// ═══════════════════════════════════════════════════════════════

const { handleRaidMainMenu, handleBackToMain } = require('./main-menu');
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

module.exports = {
  // Main menu
  handleRaidMainMenu,
  handleBackToMain,
  
  // Setup
  handleSetupModal,
  
  // Create flow
  handleNameModal,
  handleDateButton,
  handleDateModal,
  handleTimeSelect,
  handleSizeSelect,
  handleChannelSelect,
  
  // Start
  handleStartSelect,
  
  // Actions (lock/unlock/complete/cancel/repost/refresh)
  handleRaidAction
};
