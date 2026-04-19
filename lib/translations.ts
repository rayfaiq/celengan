export type Language = 'id' | 'en'

export const translations = {
  id: {
    // Navigation
    dashboard: 'Dashboard',
    accounts: 'Akun',
    transactions: 'Transaksi',
    history: 'Riwayat',
    settings: 'Pengaturan',
    signOut: 'Keluar',

    // History Page
    balanceHistory: 'Riwayat Saldo',
    noHistoryFound: 'Riwayat saldo tidak ditemukan. Mulai perbarui saldo akun Anda untuk melihatnya di sini.',
    totalNetworth: 'Total Kekayaan',
    active: 'Aktif',
    noChanges: 'Tidak ada perubahan',
    noUpdatesThisMonth: 'Tidak ada perbaruan bulan ini',
    updates: 'perbaruan',
    update: 'perbaruan',
    previousBalance: 'Saldo Sebelumnya',
    newBalance: 'Saldo Baru',
    save: 'Simpan',
    saving: 'Menyimpan...',
    cancel: 'Batal',
    edit: 'Edit',
    delete: 'Hapus',
    deleteConfirm: 'Apakah Anda yakin ingin menghapus catatan saldo ini?',
    deleteSuccess: 'Catatan saldo berhasil dihapus',
    updateSuccess: 'Catatan saldo berhasil diperbarui',
    invalidInput: 'Silakan masukkan angka yang valid',
    error: 'Terjadi kesalahan',

    // Account Types
    cash: 'Uang Tunai',
    investment: 'Investasi',
    core: 'Inti',
    satellite: 'Satelit',

    // Balance Mode
    balanceMode: 'Mode Saldo',
    balanceModeManual: 'Manual',
    balanceModeAuto: 'Otomatis',
    balanceModeManualDesc: 'Perbarui saldo secara manual',
    balanceModeAutoDesc: 'Saldo diperbarui otomatis dari transaksi',

    // Budget
    budget: 'Anggaran',
    budgetRemaining: 'Sisa Anggaran',
    budgetSpent: 'Terpakai',
    budgetRollover: 'Sisa Bulan Lalu',
    budgetMonthly: 'Anggaran Bulanan',
    budgetTransaction: 'Transaksi Anggaran',
    noBudgetSet: 'Belum ada anggaran. Atur di Pengaturan.',
    noBudgetTransactions: 'Belum ada transaksi anggaran bulan ini.',
    addBudgetTransaction: 'Tambah Pengeluaran Anggaran',
    budgetOf: 'dari',
  },
  en: {
    // Navigation
    dashboard: 'Dashboard',
    accounts: 'Accounts',
    transactions: 'Transactions',
    history: 'History',
    settings: 'Settings',
    signOut: 'Sign Out',

    // History Page
    balanceHistory: 'Balance History',
    noHistoryFound: 'No balance history found. Start updating your account balances to see them here.',
    totalNetworth: 'Total Networth',
    active: 'Active',
    noChanges: 'No changes',
    noUpdatesThisMonth: 'No updates this month',
    updates: 'updates',
    update: 'update',
    previousBalance: 'Previous Balance',
    newBalance: 'New Balance',
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Are you sure you want to delete this balance log?',
    deleteSuccess: 'Balance log deleted successfully',
    updateSuccess: 'Balance log updated successfully',
    invalidInput: 'Please enter valid numbers',
    error: 'An error occurred',

    // Account Types
    cash: 'Cash',
    investment: 'Investment',
    core: 'Core',
    satellite: 'Satellite',

    // Balance Mode
    balanceMode: 'Balance Mode',
    balanceModeManual: 'Manual',
    balanceModeAuto: 'Auto',
    balanceModeManualDesc: 'Update balance manually',
    balanceModeAutoDesc: 'Balance updates automatically from transactions',

    // Budget
    budget: 'Budget',
    budgetRemaining: 'Budget Remaining',
    budgetSpent: 'Spent',
    budgetRollover: 'Rollover',
    budgetMonthly: 'Monthly Budget',
    budgetTransaction: 'Budget Transaction',
    noBudgetSet: 'No budget set. Configure in Settings.',
    noBudgetTransactions: 'No budget transactions this month.',
    addBudgetTransaction: 'Add Budget Spending',
    budgetOf: 'of',
  },
}

export function getTranslation(lang: Language, key: keyof typeof translations.en): string {
  return translations[lang][key] || key
}
