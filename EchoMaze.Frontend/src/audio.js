export async function startAudio(onVolumeThreshold) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        
        microphone.connect(analyser);
        analyser.fftSize = 256;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        setInterval(() => {
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                const x = (dataArray[i] - 128) / 128.0;
                sum += x * x;
            }
            const rms = Math.sqrt(sum / bufferLength);
            
            // Adjust threshold as needed
            if (rms > 0.05) {
                // scale volume roughly between 1 and 5
                let intensity = Math.min(rms * 20, 5.0);
                onVolumeThreshold(intensity);
            }
        }, 100);
        
        console.log("Audio started");
    } catch (e) {
        console.error("Audio error", e);
        alert("Microphone access is required to play.");
    }
}
