import React from 'react';

function Header({ currentPage, setCurrentPage }) {
    const tabs = [
        { name: 'File Transfer', id: 'fileTransfer' },
        { name: 'Guide', id: 'guide' },
        { name: 'About', id: 'about' },
    ];

    return (
        <header className="bg-indigo-700 text-white p-4 shadow-md flex flex-col sm:flex-row justify-between items-center">
            <div className="flex items-center justify-center mb-2 sm:mb-0 w-full sm:w-auto">
                <span className="text-2xl font-bold">PeerDrop 📁</span>
            </div>
            <nav className="flex flex-wrap justify-center sm:justify-end gap-2 sm:gap-4">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setCurrentPage(tab.id)}
                        disabled={tab.disabled}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors
                            ${currentPage === tab.id
                                ? 'bg-indigo-500 text-white'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-indigo-100'}
                            ${tab.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {tab.name}
                    </button>
                ))}
            </nav>
        </header>
    );
}

export default Header;