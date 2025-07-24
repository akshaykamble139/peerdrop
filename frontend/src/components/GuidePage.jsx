import React from 'react';

function GuidePage() {
    const steps = [
        {
            title: "Create or Join a Room",
            description: "To begin, you can either create a new room or join an existing one. If you're the first person, click 'Create Room'. A unique Room ID will be generated for you. If someone else has already created a room, enter their Room ID into the input field and click 'Join Room'.",
            icon: "🚪"
        },
        {
            title: "Share Your Room ID",
            description: "Once you've created a room, your unique Room ID will be displayed in the top-right corner. You can click on it to copy the ID. Share this ID or the full link with the person you want to share files with. They will use this to join your room.",
            icon: "🔗"
        },
        {
            title: "Peers Join the Room",
            description: "When another user joins your room, their quirky username will appear next to yours in the top-right corner. A green circle next to their name indicates that a direct peer-to-peer connection has been successfully established, and you are ready to transfer files.",
            icon: "👥"
        },
        {
            title: "Select and Send Files",
            description: "Drag and drop your file(s) into the designated area, or click 'Choose File' to browse your computer. Once a file is selected, its name will appear. Click the 'Send File' button to initiate the transfer to all connected peers.",
            icon: "📤"
        },
        {
            title: "Monitor Transfer Progress",
            description: "During the transfer, you'll see a progress bar indicating the percentage of the file sent or received. The file name currently being transferred will also be displayed. Once the transfer is complete, a success message will briefly appear.",
            icon: "📊"
        },
        {
            title: "Access Received Files",
            description: "All successfully received files will be listed under the 'Received Files' section. You can click on the file name to download it directly to your device. Remember, files are never stored on the server, so download them immediately if you need them.",
            icon: "📥"
        }
    ];

    return (
        <div className="w-full flex justify-center">
            <div className="bg-white shadow-xl rounded-2xl p-6 md:p-8 w-full max-w-4xl">
                <div className="text-center mb-6 md:mb-8">
                    <h2 className="text-2xl md:text-3xl font-bold text-indigo-700 mb-3 md:mb-4">How to Use PeerDrop</h2>
                    <p className="text-gray-600 text-base md:text-lg px-2">
                        Follow these simple steps to start sharing files securely and privately.
                    </p>
                </div>

                <div className="space-y-6 md:space-y-8">
                    {steps.map((step, index) => (
                        <div key={index} className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 md:p-6 border border-indigo-100">
                            <div className="flex items-start gap-4 md:gap-6">
                                <div className="flex-shrink-0 bg-indigo-600 text-white w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm md:text-base font-bold">
                                    {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2 md:mb-3">
                                        <span className="text-xl md:text-2xl">{step.icon}</span>
                                        <h3 className="text-lg md:text-xl font-semibold text-gray-800 leading-tight">
                                            {step.title}
                                        </h3>
                                    </div>
                                    <p className="text-gray-700 text-sm md:text-base leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 md:mt-12 p-4 md:p-6 bg-indigo-50 rounded-xl border border-indigo-200">
                    <div className="text-center">
                        <h3 className="text-lg md:text-xl font-semibold text-indigo-700 mb-2 md:mb-3">🔒 Privacy & Security</h3>
                        <p className="text-sm md:text-base text-indigo-600 leading-relaxed">
                            All file transfers happen directly between your devices using peer-to-peer technology. 
                            No files are stored on our servers, ensuring complete privacy and security.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default GuidePage;