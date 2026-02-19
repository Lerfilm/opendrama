const en: Record<string, string> = {
  // Common
  "common.coins": "Coins",
  "common.episodes": "episodes",
  "common.play": "Play",
  "common.retry": "Retry",
  "common.back": "Back",
  "common.close": "Close",
  "common.loading": "Loading...",
  "common.noData": "No data",
  "common.free": "Free",
  "common.unlocked": "Unlocked",
  "common.create": "Create",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.processing": "Processing...",
  "common.ongoing": "Ongoing",
  "common.completed": "Completed",
  "common.noCover": "No cover",

  // Nav
  "nav.home": "Home",
  "nav.discover": "Discover",
  "nav.profile": "Profile",

  // Home
  "home.greeting": "Hello, {name}",
  "home.welcomeGuest": "Discover great short dramas",
  "common.login": "Sign In",
  "home.recharge": "Top Up Coins",
  "home.rechargeDesc": "Unlock more exciting episodes",
  "home.rechargeNow": "Top Up Now",
  "home.hotPicks": "Hot Picks",
  "home.noSeries": "No series yet, stay tuned",
  "home.startWatch": "Start Watching",
  "home.episodeCount": "{count} episodes",

  // Series detail
  "series.episodeList": "Episodes",
  "series.episode": "Episode {num}",
  "series.minutes": "{min} min",
  "series.notFound": "Series not found",
  "series.watchAt": "Watch {title} on OpenDrama",
  "series.episodeTitle": "{series} Episode {num} - {title}",
  "series.watchEpisode": "Watch {series} Episode {num}",

  // Episode
  "episode.unlock": "Unlock to Watch",
  "episode.currentBalance": "Current Balance",
  "episode.insufficientCoins": "Insufficient coins, please top up first",
  "episode.unlocking": "Unlocking...",
  "episode.unlockCost": "Spend {cost} coins to unlock",
  "episode.unlockFailed": "Unlock failed",
  "episode.unlockFailedRetry": "Unlock failed, please retry",

  // Profile
  "profile.coinBalance": "Coin Balance",
  "profile.rechargeCoins": "Top Up Coins",
  "profile.purchaseHistory": "Purchase History",
  "profile.cardCollection": "Card Collection",
  "profile.settings": "Settings",
  "profile.logout": "Log Out",

  // Purchases
  "purchases.currentBalance": "Current Balance",
  "purchases.title": "Purchase History",
  "purchases.noPurchases": "No purchase records",
  "purchases.rechargeCoins": "Top up {coins} coins",
  "purchases.success": "Success",
  "purchases.pending": "Pending",
  "purchases.failed": "Failed",

  // Recharge
  "recharge.balance": "Current Balance",
  "recharge.coinPerEpisode": "1 coin = 1 episode",
  "recharge.canWatch": "Can watch about",
  "recharge.selectPackage": "Select a Package",
  "recharge.mostPopular": "Most Popular",
  "recharge.coinsAmount": "{coins} coins",
  "recharge.canWatchEpisodes": "Watch {coins} episodes",
  "recharge.now": "Top Up Now",
  "recharge.info": "Top Up Info",
  "recharge.info1": "1 coin unlocks 1 episode",
  "recharge.info2": "First episode is always free",
  "recharge.info3": "Coins never expire",
  "recharge.info4": "Supports Alipay, WeChat Pay, and credit cards",
  "recharge.failed": "Top up failed, please retry",

  // Recharge success
  "recharge.successTitle": "Top Up Successful!",
  "recharge.successDesc": "Your coins have been added. Go unlock exciting episodes!",
  "recharge.payAmount": "Paid: ¥{amount}",
  "recharge.startWatch": "Start Watching",
  "recharge.viewHistory": "View Purchase History",

  // Cards
  "cards.myCollection": "My Collection",
  "cards.collectionProgress": "Collection Progress",
  "cards.collection": "My Collection",
  "cards.gallery": "Card Gallery",
  "cards.noCards": "No cards collected yet",
  "cards.noCardsHint": "Watch episodes to get card drops",
  "cards.notObtained": "Not obtained",
  "cards.congratulations": "Congratulations! New Card!",
  "cards.owned": "Owned x{qty}",
  "cards.continueWatch": "Continue Watching",

  // Discover
  "discover.title": "Discover",
  "discover.comingSoon": "Category browsing coming soon",

  // Error
  "error.loadFailed": "Load Failed",
  "error.loadFailedDesc": "Something went wrong while loading. Please try again later.",
  "error.somethingWrong": "Something Went Wrong",
  "error.somethingWrongDesc": "Something went wrong while loading the page. Please try again later.",
  "error.notFound": "Page not found or has been removed",

  // Auth
  "auth.welcome": "Welcome to OpenDrama",
  "auth.subtitle": "Short dramas, anytime, anywhere",
  "auth.googleLogin": "Sign in with Google",
  "auth.agreement": "By signing in, you agree to our Terms of Service and Privacy Policy",

  // Admin
  "admin.dashboard": "Dashboard",
  "admin.dashboardDesc": "OpenDrama Admin System",
  "admin.totalSeries": "Total Series",
  "admin.totalUsers": "Total Users",
  "admin.totalRevenue": "Total Revenue",
  "admin.totalCards": "Total Cards",
  "admin.registeredUsers": "Registered users",
  "admin.totalRecharge": "Total recharged",
  "admin.createdCards": "Cards created",
  "admin.quickActions": "Quick Actions",
  "admin.quickAction1": "Series: Create, edit, and delete series and episodes",
  "admin.quickAction2": "Cards: Create and edit card info",
  "admin.quickAction3": "Video: Upload videos to Mux, get PlaybackID",
  "admin.backToFront": "Back to Site",
  "admin.overview": "Overview",
  "admin.seriesManagement": "Series",
  "admin.cardManagement": "Cards",
  "admin.videoUpload": "Upload",
  "admin.analytics": "Analytics",

  // Admin series
  "admin.series.title": "Series Management",
  "admin.series.desc": "Manage all series and episode content",
  "admin.series.create": "Create Series",
  "admin.series.noSeries": "No series yet, click \"Create Series\" to start",
  "admin.series.online": "Online",
  "admin.series.offline": "Offline",
  "admin.series.createdAt": "Created: ",

  // Admin cards
  "admin.cards.title": "Card Management",
  "admin.cards.desc": "Manage all card content",
  "admin.cards.create": "Create Card",
  "admin.cards.noCards": "No cards yet, click \"Create Card\" to start",

  // Analytics
  "analytics.title": "Analytics",
  "analytics.totalUsers": "Total Users",
  "analytics.totalRevenue": "Total Revenue",
  "analytics.totalWatchTime": "Total Watch Time",
  "analytics.todayNew": "New Today",
  "analytics.userGrowth": "User Growth (Past 30 Days)",
  "analytics.topSeries": "Top 10 Series",
  "analytics.times": "views",
  "analytics.revenueTrend": "Revenue Trend (Past 30 Days)",
  "analytics.funnel": "Retention Funnel",
  "analytics.registered": "Registered",
  "analytics.firstWatch": "First Watch",
  "analytics.firstPay": "First Payment",
  "analytics.repurchase": "Repurchase",

  // Card rarity names
  "rarity.common": "Common",
  "rarity.rare": "Rare",
  "rarity.epic": "Epic",
  "rarity.legendary": "Legendary",
  "rarity.limited": "Limited",
}

export default en
