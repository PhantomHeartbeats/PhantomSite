/* =========================================================
   PHANTOM HEARTBEATS — MUSIC PLAYER
   Dynamic Supabase / R2 version
   TRUE GAPLESS WEB AUDIO PLAYBACK
   SYNCED LRC LYRICS
========================================================= */

let tracks = [];
let currentTrack = 0;
let currentReleaseId = null;
let isAutoContinuing = false;
let shuffleEnabled = false;


/* =========================================================
   WEB AUDIO STATE
========================================================= */

let audioContext = null;
let masterGain = null;
let currentSource = null;
let scheduledNext = null;
let currentStartTime = 0;
let currentOffset = 0;
let isPlaying = false;
let playbackToken = 0;
let progressFrame = null;
let scheduledTrackTimer = null;

const decodedBuffers = new Map();
const bufferPromises = new Map();


/* =========================================================
   ARTWORK COLOR TRANSITION STATE
========================================================= */

let currentCoverColor1 = [255, 181, 60];
let currentCoverColor2 = [255, 145, 0];
let currentCoverColor3 = [255, 210, 90];
let coverColorAnimationFrame = null;


/* =========================================================
   SYNCED LYRICS STATE
========================================================= */

let parsedLyrics = [];
let activeLyricIndex = -1;
let lyricsContainer = null;


/* =========================================================
   DOM
========================================================= */

const audio =
    document.getElementById("audio");

const trackList =
    document.getElementById("tracks");

const playerTitle =
    document.getElementById("player-title");

const playerArtist =
    document.getElementById("player-artist");

const playerArtwork =
    document.getElementById("player-artwork");

const playButton =
    document.getElementById("play-button");

const previousButton =
    document.getElementById("previous-button");

const nextButton =
    document.getElementById("next-button");

const shuffleButton =
    document.getElementById("shuffle-button");

const progress =
    document.getElementById("progress");

const currentTime =
    document.getElementById("current-time");

const duration =
    document.getElementById("duration");

const volume =
    document.getElementById("volume");

const volumeValue =
    document.getElementById("volume-value");

const volumeIcon =
    document.getElementById("volume-icon");

const musicPlayer =
    document.getElementById("music-player");


/* =========================================================
   LYRICS CONTAINER
========================================================= */

/*
 * If you already have a lyrics element, use:
 *
 * <div id="lyrics"></div>
 *
 * Otherwise the player creates one automatically.
 */

lyricsContainer =
    document.getElementById("lyrics") ||
    document.getElementById("lyrics-container") ||
    document.getElementById("synced-lyrics");


function createLyricsContainer() {

    if (lyricsContainer) {
        return lyricsContainer;
    }

    lyricsContainer =
        document.createElement("div");

    lyricsContainer.id =
        "lyrics-container";

    lyricsContainer.className =
        "lyrics-container";

    if (musicPlayer) {

        musicPlayer.appendChild(
            lyricsContainer
        );

    } else {

        document.body.appendChild(
            lyricsContainer
        );

    }

    return lyricsContainer;

}


createLyricsContainer();


/* =========================================================
   LYRICS STYLES
========================================================= */

function createLyricsStyles() {

    if (
        document.getElementById(
            "phantom-heartbeats-lyrics-styles"
        )
    ) {

        return;

    }


    const style =
        document.createElement("style");

    style.id =
        "phantom-heartbeats-lyrics-styles";

    style.textContent = `

        #lyrics-container,
        .lyrics-container {

            width: 100%;
            max-height: 420px;
            overflow-y: auto;
            overflow-x: hidden;

            padding: 32px 20px;

            box-sizing: border-box;

            text-align: center;

            scrollbar-width: none;

            scroll-behavior: smooth;

        }


        #lyrics-container::-webkit-scrollbar,
        .lyrics-container::-webkit-scrollbar {

            display: none;

        }


        .lyrics-line {

            margin: 12px 0;

            opacity: 0.35;

            transform: scale(0.98);

            transition:
                opacity 220ms ease,
                transform 220ms ease,
                filter 220ms ease;

            font-size: 1.05rem;

            line-height: 1.55;

            font-weight: 500;

            filter: blur(0.1px);

        }


        .lyrics-line.past {

            opacity: 0.48;

        }


        .lyrics-line.active {

            opacity: 1;

            transform: scale(1);

            font-weight: 700;

            filter: none;

        }


        .lyrics-empty {

            opacity: 0.45;

            padding: 30px 20px;

            text-align: center;

        }

    `;


    document.head.appendChild(
        style
    );

}


createLyricsStyles();


/* =========================================================
   LRC PARSER
========================================================= */

function parseLRC(
    lyrics
) {

    if (
        !lyrics ||
        typeof lyrics !== "string"
    ) {

        return [];

    }


    const result = [];


    const lines =
        lyrics.split(/\r?\n/);


    /*
     * Supports:
     *
     * [00:12.40]Lyrics
     * [01:03.250]Lyrics
     * [1:03.25]Lyrics
     * [00:12]Lyrics
     *
     * Multiple timestamps on one line
     * are also supported.
     */

    const timestampRegex =
        /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;


    for (
        const rawLine of lines
    ) {

        const matches =
            [
                ...rawLine.matchAll(
                    timestampRegex
                )
            ];


        if (!matches.length) {
            continue;
        }


        const text =
            rawLine
                .replace(
                    timestampRegex,
                    ""
                )
                .trim();


        /*
         * Ignore metadata-only LRC tags:
         *
         * [ar:]
         * [ti:]
         * [al:]
         * [by:]
         */

        if (!text) {
            continue;
        }


        for (
            const match of matches
        ) {

            const minutes =
                Number(
                    match[1]
                );


            const seconds =
                Number(
                    match[2]
                );


            const fraction =
                match[3] ||
                "0";


            let milliseconds;


            if (
                fraction.length === 1
            ) {

                milliseconds =
                    Number(
                        fraction
                    ) * 100;

            } else if (
                fraction.length === 2
            ) {

                milliseconds =
                    Number(
                        fraction
                    ) * 10;

            } else {

                milliseconds =
                    Number(
                        fraction.slice(
                            0,
                            3
                        )
                    );

            }


            const time =
                (
                    minutes * 60
                ) +
                seconds +
                (
                    milliseconds / 1000
                );


            result.push({

                time,

                text

            });

        }

    }


    result.sort(
        (
            a,
            b
        ) =>
            a.time -
            b.time
    );


    return result;

}


/* =========================================================
   RENDER LYRICS
========================================================= */

function renderLyrics(
    track
) {

    if (!lyricsContainer) {
        return;
    }


    activeLyricIndex =
        -1;


    const lyrics =
        track?.lyricsLrc ||
        track?.lyrics_lrc ||
        "";


    parsedLyrics =
        parseLRC(
            lyrics
        );


    lyricsContainer.innerHTML =
        "";


    if (
        !parsedLyrics.length
    ) {

        lyricsContainer.hidden =
            true;

        return;

    }


    lyricsContainer.hidden =
        false;


    const fragment =
        document.createDocumentFragment();


    parsedLyrics.forEach(
        (
            lyric,
            index
        ) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "lyrics-line";


            element.dataset.index =
                index;


            /*
             * Store the exact LRC timestamp
             * so clicking this line can seek
             * directly to it.
             */

            element.dataset.time =
                lyric.time;


            element.textContent =
                lyric.text;


            /*
             * Clicking a lyric seeks directly
             * to that lyric's timestamp.
             */

            element.addEventListener(
                "click",
                () => {

                    seekTo(
                        lyric.time
                    );

                }
            );


            /*
             * Make it visually obvious that
             * the lyric is clickable.
             */

            element.style.cursor =
                "pointer";


            fragment.appendChild(
                element
            );

        }
    );


    lyricsContainer.appendChild(
        fragment
    );

}


/* =========================================================
   CLEAR LYRICS
========================================================= */

function clearLyrics() {

    parsedLyrics = [];

    activeLyricIndex = -1;


    if (!lyricsContainer) {
        return;
    }


    lyricsContainer.innerHTML =
        "";


    lyricsContainer.hidden =
        true;

}


/* =========================================================
   UPDATE SYNCED LYRICS
========================================================= */

function updateLyrics(
    position = getCurrentTime()
) {

    if (
        !lyricsContainer ||
        !parsedLyrics.length
    ) {

        return;

    }


    let newIndex = -1;


    for (
        let i = 0;
        i < parsedLyrics.length;
        i++
    ) {

        if (
            parsedLyrics[i].time <=
            position
        ) {

            newIndex = i;

        } else {

            break;

        }

    }


    if (
        newIndex ===
        activeLyricIndex
    ) {

        return;

    }


    activeLyricIndex =
        newIndex;


    const lyricElements =
        lyricsContainer.querySelectorAll(
            ".lyrics-line"
        );


    lyricElements.forEach(
        (
            element,
            index
        ) => {

            element.classList.toggle(
                "past",
                index <
                    activeLyricIndex
            );


            element.classList.toggle(
                "active",
                index ===
                    activeLyricIndex
            );

        }
    );


    if (
        activeLyricIndex >= 0
    ) {

        const activeElement =
            lyricElements[
                activeLyricIndex
            ];


        if (activeElement) {

            activeElement.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

        }

    }

}


/* =========================================================
   AUDIO CONTEXT
========================================================= */

function ensureAudioContext() {

    if (audioContext) {
        return audioContext;
    }


    const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;


    if (!AudioContextClass) {

        throw new Error(
            "Web Audio API is not supported by this browser."
        );

    }


    audioContext =
        new AudioContextClass();


    masterGain =
        audioContext.createGain();


    masterGain.gain.value =
        Number(
            volume?.value || 1
        );


    masterGain.connect(
        audioContext.destination
    );


    return audioContext;

}


async function resumeAudioContext() {

    const context =
        ensureAudioContext();


    if (
        context.state ===
        "suspended"
    ) {

        await context.resume();

    }

}


/* =========================================================
   BUFFER LOADING
========================================================= */

async function loadTrackBuffer(
    track
) {

    if (
        !track ||
        !track.file
    ) {

        throw new Error(
            "Track has no audio file."
        );

    }


    const url =
        track.file;


    if (
        decodedBuffers.has(
            url
        )
    ) {

        return decodedBuffers.get(
            url
        );

    }


    if (
        bufferPromises.has(
            url
        )
    ) {

        return bufferPromises.get(
            url
        );

    }


    const promise =
        (async () => {

            const context =
                ensureAudioContext();


            const response =
                await fetch(
                    url
                );


            if (!response.ok) {

                throw new Error(
                    `Audio download failed: ${response.status}`
                );

            }


            const arrayBuffer =
                await response.arrayBuffer();


            const buffer =
                await context.decodeAudioData(
                    arrayBuffer
                );


            decodedBuffers.set(
                url,
                buffer
            );


            return buffer;

        })();


    bufferPromises.set(
        url,
        promise
    );


    try {

        return await promise;

    } catch (error) {

        bufferPromises.delete(
            url
        );

        throw error;

    }

}


/* =========================================================
   CURRENT BUFFER
========================================================= */

function getCurrentBuffer() {

    const track =
        tracks[currentTrack];


    if (!track) {
        return null;
    }


    return (
        decodedBuffers.get(
            track.file
        ) ||
        null
    );

}


/* =========================================================
   CURRENT TIME
========================================================= */

function getCurrentTime() {

    const buffer =
        getCurrentBuffer();


    if (!buffer) {
        return 0;
    }


    if (
        !isPlaying ||
        !audioContext
    ) {

        return Math.min(
            Math.max(
                currentOffset,
                0
            ),
            buffer.duration
        );

    }


    return Math.min(
        Math.max(
            audioContext.currentTime -
            currentStartTime,
            0
        ),
        buffer.duration
    );

}


/* =========================================================
   STOP SOURCE
========================================================= */

function stopSource(
    source
) {

    if (!source) {
        return;
    }


    try {

        source.onended =
            null;

        source.stop();

    } catch {

        /*
         * Source may already be stopped.
         */

    }

}


/* =========================================================
   CLEAR SCHEDULED NEXT
========================================================= */

function clearScheduledNext() {

    if (
        scheduledTrackTimer
    ) {

        clearTimeout(
            scheduledTrackTimer
        );

        scheduledTrackTimer =
            null;

    }


    if (
        scheduledNext?.source
    ) {

        stopSource(
            scheduledNext.source
        );

    }


    scheduledNext =
        null;

}


/* =========================================================
   RESET PLAYBACK
========================================================= */

function resetPlayback() {

    playbackToken++;


    if (
        scheduledTrackTimer
    ) {

        clearTimeout(
            scheduledTrackTimer
        );

        scheduledTrackTimer =
            null;

    }


    if (currentSource) {

        stopSource(
            currentSource
        );

    }


    if (
        scheduledNext?.source
    ) {

        stopSource(
            scheduledNext.source
        );

    }


    currentSource =
        null;

    scheduledNext =
        null;

    isPlaying =
        false;

    currentStartTime =
        0;

    currentOffset =
        0;


    stopProgressAnimation();

    setPlayState(false);

    updateActiveTrack();

    updateProgressDisplay();

}


/* =========================================================
   STOP PLAYBACK
========================================================= */

function stopPlayback() {

    resetPlayback();

    currentOffset = 0;

    updateProgressDisplay();

    updateLyrics(0);

}


/* =========================================================
   CREATE AUDIO SOURCE
========================================================= */

function createSource(
    buffer,
    startTime,
    offset,
    onEnded
) {

    const context =
        ensureAudioContext();


    const source =
        context.createBufferSource();


    source.buffer =
        buffer;


    source.connect(
        masterGain
    );


    source.onended =
        onEnded;


    source.start(
        startTime,
        offset
    );


    return source;

}


/* =========================================================
   SCHEDULE NEXT TRACK
========================================================= */

async function scheduleNextTrack() {

    if (!isPlaying) {
        return;
    }


    if (scheduledNext) {
        return;
    }


    const nextIndex =
        currentTrack + 1;


    if (
        nextIndex >=
        tracks.length
    ) {

        return;

    }


    const nextTrack =
        tracks[nextIndex];


    if (!nextTrack?.file) {
        return;
    }


    const currentBuffer =
        getCurrentBuffer();


    if (!currentBuffer) {
        return;
    }


    const context =
        ensureAudioContext();


    const exactEndTime =
        currentStartTime +
        currentBuffer.duration;


    try {

        const nextBuffer =
            await loadTrackBuffer(
                nextTrack
            );


        if (
            !isPlaying ||
            currentTrack + 1 !==
                nextIndex
        ) {

            return;

        }


        const startTime =
            exactEndTime;


        const source =
            createSource(
                nextBuffer,
                startTime,
                0,
                () => {

                    handleScheduledTrackEnded(
                        source,
                        nextIndex
                    );

                }
            );


        scheduledNext = {

            source,

            trackIndex:
                nextIndex,

            startTime

        };


        const delay =
            Math.max(
                (
                    startTime -
                    context.currentTime
                ) *
                1000,
                0
            );


        scheduledTrackTimer =
            setTimeout(
                () => {

                    scheduledTrackTimer =
                        null;


                    commitScheduledTrack(
                        source,
                        nextIndex
                    );

                },
                delay
            );


    } catch (error) {

        console.warn(
            "Could not prepare next track:",
            error
        );

    }

}


/* =========================================================
   COMMIT SCHEDULED TRACK
========================================================= */

function commitScheduledTrack(
    source,
    trackIndex
) {

    if (
        !scheduledNext ||
        scheduledNext.source !==
            source
    ) {

        return;

    }


    if (!isPlaying) {
        return;
    }


    currentSource =
        source;


    currentTrack =
        trackIndex;


    currentReleaseId =
        tracks[currentTrack]?.releaseId ||
        currentReleaseId;


    currentStartTime =
        scheduledNext.startTime;


    currentOffset =
        0;


    scheduledNext =
        null;


    updatePlayerDisplay();

    updateMediaSession();

    updateActiveTrack();

    updateProgressDisplay();

    preloadNextTrack();

}


/* =========================================================
   SCHEDULED SOURCE ENDED
========================================================= */

function handleScheduledTrackEnded(
    source,
    trackIndex
) {

    if (
        currentSource !==
        source ||
        currentTrack !==
        trackIndex
    ) {

        return;

    }


    if (scheduledNext) {
        return;
    }


    continueAfterTrack();

}


/* =========================================================
   PRELOAD NEXT
========================================================= */

function preloadNextTrack() {

    if (!tracks.length) {
        return;
    }


    const nextIndex =
        currentTrack + 1;


    if (
        nextIndex >=
        tracks.length
    ) {

        return;

    }


    const nextTrack =
        tracks[nextIndex];


    if (!nextTrack?.file) {
        return;
    }


    loadTrackBuffer(
        nextTrack
    )
        .then(
            () => {

                if (
                    isPlaying &&
                    currentTrack + 1 ===
                        nextIndex
                ) {

                    scheduleNextTrack();

                }

            }
        )
        .catch(
            error => {

                console.warn(
                    "Could not preload next track:",
                    error
                );

            }
        );

}


/* =========================================================
   PLAYER TRACKS
========================================================= */

window.setPlayerTracks =
    function(newTracks) {

        resetPlayback();


        tracks =
            Array.isArray(
                newTracks
            )
                ? newTracks
                : [];


        currentTrack =
            0;


        currentReleaseId =
            tracks[0]?.releaseId ||
            null;


        if (!tracks.length) {

            if (playerTitle) {

                playerTitle.textContent =
                    "Select a track";

            }


            if (playerArtist) {

                playerArtist.textContent =
                    "Phantom Heartbeats";

            }


            if (playerArtwork) {

                playerArtwork.removeAttribute(
                    "src"
                );

            }


            clearLyrics();


            if (
                "mediaSession" in navigator
            ) {

                navigator.mediaSession.metadata =
                    null;

            }


            return;

        }


        createTrackList();


        loadTrack(
            0,
            false
        );

    };


/* =========================================================
   LOAD TRACK
========================================================= */

async function loadTrack(
    index,
    autoplay = false,
    forceLoad = false
) {

    if (
        index < 0 ||
        index >= tracks.length
    ) {

        return;

    }


    const track =
        tracks[index];


    currentTrack =
        index;


    currentReleaseId =
        track.releaseId ||
        currentReleaseId ||
        null;


    updatePlayerDisplay();

    updateMediaSession();


    if (progress) {

        progress.value =
            0;


        progress.style.setProperty(
            "--progress",
            "0%"
        );

    }


    if (currentTime) {

        currentTime.textContent =
            "0:00";

    }


    if (duration) {

        duration.textContent =
            "0:00";

    }


    updateLyrics(0);


    try {

        const buffer =
            await loadTrackBuffer(
                track
            );


        if (
            currentTrack !==
                index
        ) {

            return;

        }


        if (duration) {

            duration.textContent =
                formatTime(
                    buffer.duration
                );

        }


        const durationElement =
            document.getElementById(
                `duration-${index}`
            );


        if (durationElement) {

            durationElement.textContent =
                formatTime(
                    buffer.duration
                );

        }


        preloadNextTrack();


        if (autoplay) {

            await startCurrentTrack(
                0
            );

        }

    } catch (error) {

        console.error(
            "Could not load track:",
            error
        );

    }

}


/* =========================================================
   START CURRENT TRACK
========================================================= */

async function startCurrentTrack(
    offset = 0
) {

    if (!tracks.length) {
        return;
    }


    const track =
        tracks[currentTrack];


    if (!track) {
        return;
    }


    const token =
        ++playbackToken;


    try {

        await resumeAudioContext();


        const buffer =
            await loadTrackBuffer(
                track
            );


        if (
            token !==
            playbackToken
        ) {

            return;

        }


        clearScheduledNext();


        if (currentSource) {

            stopSource(
                currentSource
            );


            currentSource =
                null;

        }


        const context =
            ensureAudioContext();


        const safeOffset =
            Math.min(
                Math.max(
                    Number(offset) || 0,
                    0
                ),
                Math.max(
                    buffer.duration -
                    0.0001,
                    0
                )
            );


        const startTime =
            context.currentTime +
            0.02;


        currentStartTime =
            startTime -
            safeOffset;


        currentOffset =
            safeOffset;


        const source =
            createSource(
                buffer,
                startTime,
                safeOffset,
                () => {

                    handleCurrentSourceEnded(
                        source
                    );

                }
            );


        currentSource =
            source;


        isPlaying =
            true;


        updatePlayerDisplay();

        updateMediaSession();

        setPlayState(true);

        updateActiveTrack();

        startProgressAnimation();

        preloadNextTrack();


    } catch (error) {

        console.error(
            "Could not start track:",
            error
        );


        isPlaying =
            false;


        setPlayState(false);

        updateActiveTrack();

    }

}


/* =========================================================
   CURRENT SOURCE ENDED
========================================================= */

function handleCurrentSourceEnded(
    source
) {

    if (
        currentSource !==
        source
    ) {

        return;

    }


    if (scheduledNext) {
        return;
    }


    currentSource =
        null;


    if (!isPlaying) {
        return;
    }


    continueAfterTrack();

}


/* =========================================================
   PLAY TRACK
========================================================= */

function playTrack(
    index
) {

    if (
        index < 0 ||
        index >= tracks.length
    ) {

        return;

    }


    const switchingTracks =
        currentTrack !== index;


    if (switchingTracks) {

        currentOffset =
            0;

    }


    currentTrack =
        index;


    currentReleaseId =
        tracks[index]?.releaseId ||
        currentReleaseId;


    startCurrentTrack(
        switchingTracks
            ? 0
            : currentOffset
    );

}


/* =========================================================
   TOGGLE PLAY
========================================================= */

async function togglePlay() {

    if (!tracks.length) {
        return;
    }


    if (isPlaying) {

        pausePlayback();

        return;

    }


    await startCurrentTrack(
        currentOffset
    );

}


/* =========================================================
   PAUSE
========================================================= */

function pausePlayback() {

    if (!isPlaying) {
        return;
    }


    const position =
        getCurrentTime();


    playbackToken++;


    if (scheduledTrackTimer) {

        clearTimeout(
            scheduledTrackTimer
        );

        scheduledTrackTimer =
            null;

    }


    if (currentSource) {

        stopSource(
            currentSource
        );

        currentSource =
            null;

    }


    if (scheduledNext?.source) {

        stopSource(
            scheduledNext.source
        );

    }


    scheduledNext =
        null;


    isPlaying =
        false;


    currentStartTime =
        0;


    currentOffset =
        position;


    stopProgressAnimation();

    setPlayState(false);

    updateActiveTrack();

    updateProgressDisplay();

    updateLyrics(
        position
    );

}


/* =========================================================
   CONTINUE AFTER TRACK
========================================================= */

async function continueAfterTrack() {

    if (isAutoContinuing) {
        return;
    }


    isAutoContinuing =
        true;


    try {

        if (
            currentTrack <
            tracks.length - 1
        ) {

            const nextIndex =
                currentTrack + 1;


            currentTrack =
                nextIndex;


            currentOffset =
                0;


            await startCurrentTrack(
                0
            );


            return;

        }


        await continueIntoRandomRelease();


    } finally {

        isAutoContinuing =
            false;

    }

}


/* =========================================================
   NEXT
========================================================= */

function nextTrack() {

    if (!tracks.length) {
        return;
    }


    if (
        currentTrack <
        tracks.length - 1
    ) {

        playTrack(
            currentTrack + 1
        );


        return;

    }


    continueIntoRandomRelease();

}


/* =========================================================
   PREVIOUS
========================================================= */

function previousTrack() {

    if (!tracks.length) {
        return;
    }


    const time =
        getCurrentTime();


    if (time > 3) {

        seekTo(0);

        return;

    }


    if (currentTrack > 0) {

        playTrack(
            currentTrack - 1
        );

        return;

    }


    if (
        typeof releases ===
            "undefined" ||
        typeof releaseTracks ===
            "undefined"
    ) {

        return;

    }


    const releaseIndex =
        releases.findIndex(
            release =>
                release.id ===
                currentReleaseId
        );


    if (releaseIndex <= 0) {
        return;
    }


    for (
        let i =
            releaseIndex - 1;
        i >= 0;
        i--
    ) {

        const previousRelease =
            releases[i];


        const previousTracks =
            buildReleasePlayerTracks(
                previousRelease
            );


        if (!previousTracks.length) {
            continue;
        }


        tracks =
            previousTracks;


        currentTrack =
            tracks.length - 1;


        currentReleaseId =
            previousRelease.id;


        createTrackList();


        currentOffset =
            0;


        startCurrentTrack(
            0
        );


        return;

    }

}


/* =========================================================
   BUILD RELEASE PLAYER TRACKS
========================================================= */

function buildReleasePlayerTracks(
    release
) {

    if (
        !release ||
        typeof releaseTracks ===
            "undefined"
    ) {

        return [];

    }


    const sourceTracks =
        releaseTracks[
            release.id
        ] || [];


    return sourceTracks
        .filter(
            track =>
                !!track.audio_url
        )
        .sort(
            (
                a,
                b
            ) =>
                Number(
                    a.track_number ||
                    0
                ) -
                Number(
                    b.track_number ||
                    0
                )
        )
        .map(
            track => {

                return {

                    id:
                        track.id,

                    releaseId:
                        release.id,

                    releaseTitle:
                        release.title,

                    title:
                        track.title,

                    artists:
                        track.artists ||
                        release.artists ||
                        "Phantom Heartbeats",

                    file:
                        track.audio_url,

                    artwork:
                        release.cover_url ||
                        "",

                    duration:
                        Number(
                            track.duration_seconds
                        ) || 0,

                    /*
                     * NEW:
                     * Synced LRC lyrics from Supabase.
                     */

                    lyricsLrc:
                        track.lyrics_lrc ||
                        ""

                };

            }
        );

}


/* =========================================================
   RANDOM RELEASE
========================================================= */

function getRandomNextRelease() {

    if (
        typeof releases ===
            "undefined" ||
        typeof releaseTracks ===
            "undefined"
    ) {

        return null;

    }


    const candidates =
        releases.filter(
            release => {

                if (!release) {
                    return false;
                }


                if (
                    release.id ===
                    currentReleaseId
                ) {

                    return false;

                }


                const sourceTracks =
                    releaseTracks[
                        release.id
                    ] || [];


                return sourceTracks.some(
                    track =>
                        !!track.audio_url
                );

            }
        );


    if (!candidates.length) {
        return null;
    }


    return candidates[
        Math.floor(
            Math.random() *
            candidates.length
        )
    ];

}


/* =========================================================
   RANDOM RELEASE CONTINUATION
========================================================= */

async function continueIntoRandomRelease() {

    if (isAutoContinuing) {
        return;
    }


    isAutoContinuing =
        true;


    try {

        const nextRelease =
            getRandomNextRelease();


        if (!nextRelease) {

            stopPlayback();

            return;

        }


        const nextTracks =
            buildReleasePlayerTracks(
                nextRelease
            );


        if (!nextTracks.length) {

            stopPlayback();

            return;

        }


        resetPlayback();


        tracks =
            nextTracks;


        currentTrack =
            0;


        currentReleaseId =
            nextRelease.id;


        createTrackList();


        await loadTrack(
            0,
            true,
            true
        );


    } catch (error) {

        console.error(
            "Could not automatically continue to another release:",
            error
        );


        stopPlayback();

    } finally {

        isAutoContinuing =
            false;

    }

}


/* =========================================================
   TRACKLIST
========================================================= */

function createTrackList() {

    if (!trackList) {
        return;
    }


    trackList.innerHTML =
        "";


    tracks.forEach(
        (
            track,
            index
        ) => {

            const trackElement =
                document.createElement(
                    "div"
                );


            trackElement.className =
                "track";


            trackElement.dataset.index =
                index;


            trackElement.innerHTML = `

                <div class="track-number">
                    ${String(
                        index + 1
                    ).padStart(
                        2,
                        "0"
                    )}
                </div>

                <div class="track-name">
                    ${escapeHtml(
                        track.title
                    )}
                </div>

                <div
                    class="track-duration"
                    id="duration-${index}"
                >
                    ${
                        track.duration
                            ? formatTime(
                                track.duration
                            )
                            : "--:--"
                    }
                </div>

            `;


            trackElement.addEventListener(
                "click",
                () => {

                    playTrack(
                        index
                    );

                }
            );


            trackList.appendChild(
                trackElement
            );

        }
    );

}


/* =========================================================
   ACTIVE TRACK
========================================================= */

function updateActiveTrack() {

    const trackElements =
        document.querySelectorAll(
            ".track"
        );


    trackElements.forEach(
        trackElement => {

            const index =
                Number(
                    trackElement.dataset.index
                );


            trackElement.classList.toggle(
                "active",
                index ===
                    currentTrack &&
                isPlaying
            );

        }
    );

}


/* =========================================================
   PLAYER DISPLAY
========================================================= */

function updatePlayerDisplay() {

    const track =
        tracks[currentTrack];


    if (!track) {

        clearLyrics();

        return;

    }


    if (playerTitle) {

        playerTitle.textContent =
            track.title ||
            "Unknown track";

    }


    if (playerArtist) {

        playerArtist.textContent =
            track.artists ||
            "Phantom Heartbeats";

    }


    /*
     * Render the lyrics immediately when
     * the current track changes.
     */

    renderLyrics(
        track
    );


    if (playerArtwork) {

        playerArtwork.classList.add(
            "changing"
        );


        setTimeout(
            () => {

                playerArtwork.src =
                    track.artwork ||
                    "";


                playerArtwork.alt =
                    track.title ||
                    "";


                playerArtwork.classList.remove(
                    "changing"
                );

            },
            120
        );

    }


    updatePlayerColors(
        track.artwork
    );

}


/* =========================================================
   PLAY STATE
========================================================= */

function setPlayState(
    playing
) {

    if (!playButton) {
        return;
    }


    const icon =
        playButton.querySelector(
            ".control-icon"
        );


    if (!icon) {
        return;
    }


    if (playing) {

        icon.textContent =
            "❚❚";


        playButton.setAttribute(
            "aria-label",
            "Pause"
        );


        playButton.setAttribute(
            "title",
            "Pause"
        );


        playButton.classList.add(
            "playing"
        );

    } else {

        icon.textContent =
            "▶";


        playButton.setAttribute(
            "aria-label",
            "Play"
        );


        playButton.setAttribute(
            "title",
            "Play"
        );


        playButton.classList.remove(
            "playing"
        );

    }


    if (
        "mediaSession" in navigator
    ) {

        try {

            navigator.mediaSession.playbackState =
                playing
                    ? "playing"
                    : "paused";

        } catch {

            /* Ignore unsupported states. */

        }

    }

}


/* =========================================================
   PROGRESS
========================================================= */

function updateProgressDisplay() {

    const buffer =
        getCurrentBuffer();


    if (!buffer) {

        if (progress) {

            progress.value =
                0;


            progress.style.setProperty(
                "--progress",
                "0%"
            );

        }


        if (currentTime) {

            currentTime.textContent =
                "0:00";

        }


        updateLyrics(0);

        return;

    }


    const position =
        getCurrentTime();


    const percentage =
        buffer.duration > 0
            ? (
                position /
                buffer.duration
            ) * 100
            : 0;


    if (progress) {

        progress.value =
            percentage;


        progress.style.setProperty(
            "--progress",
            `${percentage}%`
        );

    }


    if (currentTime) {

        currentTime.textContent =
            formatTime(
                position
            );

    }


    if (duration) {

        duration.textContent =
            formatTime(
                buffer.duration
            );

    }


    const durationElement =
        document.getElementById(
            `duration-${currentTrack}`
        );


    if (durationElement) {

        durationElement.textContent =
            formatTime(
                buffer.duration
            );

    }


    /*
     * Sync lyrics directly to the exact
     * Web Audio playback position.
     */

    updateLyrics(
        position
    );

}


/* =========================================================
   PROGRESS LOOP
========================================================= */

function startProgressAnimation() {

    stopProgressAnimation();


    function update() {

        if (!isPlaying) {
            return;
        }


        updateProgressDisplay();

        updateMediaSessionPosition();


        progressFrame =
            requestAnimationFrame(
                update
            );

    }


    progressFrame =
        requestAnimationFrame(
            update
        );

}


function stopProgressAnimation() {

    if (progressFrame) {

        cancelAnimationFrame(
            progressFrame
        );


        progressFrame =
            null;

    }

}


/* =========================================================
   SEEK
========================================================= */

function seekTo(
    seconds
) {

    const buffer =
        getCurrentBuffer();


    if (!buffer) {
        return;
    }


    const target =
        Math.min(
            Math.max(
                Number(seconds) || 0,
                0
            ),
            buffer.duration
        );


    const wasPlaying =
        isPlaying;


    currentOffset =
        target;


    /*
     * Update lyrics immediately even before
     * the new Web Audio source starts.
     */

    updateLyrics(
        target
    );


    if (wasPlaying) {

        startCurrentTrack(
            target
        );

    } else {

        updateProgressDisplay();

    }

}


if (progress) {

    progress.addEventListener(
        "input",
        () => {

            const buffer =
                getCurrentBuffer();


            if (!buffer) {
                return;
            }


            const percentage =
                Number(
                    progress.value
                );


            const target =
                (
                    percentage /
                    100
                ) *
                buffer.duration;


            currentOffset =
                target;


            if (currentTime) {

                currentTime.textContent =
                    formatTime(
                        target
                    );

            }


            progress.style.setProperty(
                "--progress",
                `${percentage}%`
            );


            /*
             * Keep lyrics synced while
             * dragging the progress bar.
             */

            updateLyrics(
                target
            );


            if (isPlaying) {

                seekTo(
                    target
                );

            }

        }
    );

}


/* =========================================================
   MEDIA SESSION
========================================================= */

function updateMediaSession() {

    if (
        !("mediaSession" in navigator) ||
        !tracks.length
    ) {

        return;

    }


    const track =
        tracks[currentTrack];


    if (!track) {
        return;
    }


    try {

        navigator.mediaSession.metadata =
            new MediaMetadata({

                title:
                    track.title ||
                    "Unknown track",

                artist:
                    track.artists ||
                    "Phantom Heartbeats",

                album:
                    track.releaseTitle ||
                    "Phantom Heartbeats",

                artwork:
                    track.artwork
                        ? [
                            {
                                src:
                                    track.artwork
                            }
                        ]
                        : []

            });

    } catch (error) {

        console.warn(
            "Could not update Media Session metadata:",
            error
        );

    }

}


function updateMediaSessionPosition() {

    if (
        !("mediaSession" in navigator) ||
        !(
            "setPositionState" in
            navigator.mediaSession
        )
    ) {

        return;

    }


    const buffer =
        getCurrentBuffer();


    if (!buffer) {
        return;
    }


    try {

        navigator.mediaSession.setPositionState({

            duration:
                buffer.duration,

            playbackRate:
                1,

            position:
                Math.min(
                    getCurrentTime(),
                    buffer.duration
                )

        });

    } catch {

        /*
         * Ignore invalid Media Session
         * position states.
         */

    }

}


/* =========================================================
   MEDIA SESSION HANDLERS
========================================================= */

if (
    "mediaSession" in navigator
) {

    try {

        navigator.mediaSession.setActionHandler(
            "play",
            () => {

                togglePlay();

            }
        );


        navigator.mediaSession.setActionHandler(
            "pause",
            () => {

                pausePlayback();

            }
        );


        navigator.mediaSession.setActionHandler(
            "nexttrack",
            () => {

                nextTrack();

            }
        );


        navigator.mediaSession.setActionHandler(
            "previoustrack",
            () => {

                previousTrack();

            }
        );


        navigator.mediaSession.setActionHandler(
            "seekbackward",
            details => {

                seekTo(
                    getCurrentTime() -
                    (
                        details.seekOffset ||
                        10
                    )
                );

            }
        );


        navigator.mediaSession.setActionHandler(
            "seekforward",
            details => {

                seekTo(
                    getCurrentTime() +
                    (
                        details.seekOffset ||
                        10
                    )
                );

            }
        );


        navigator.mediaSession.setActionHandler(
            "stop",
            () => {

                stopPlayback();

            }
        );

    } catch (error) {

        console.warn(
            "Could not initialize Media Session:",
            error
        );

    }

}


/* =========================================================
   SHUFFLE
========================================================= */

function updateShuffleButton() {

    if (!shuffleButton) {
        return;
    }


    const icon =
        shuffleButton.querySelector(
            ".control-icon"
        );


    if (!icon) {
        return;
    }


    if (shuffleEnabled) {

        icon.textContent =
            "🔄";


        shuffleButton.setAttribute(
            "aria-label",
            "Shuffle on"
        );


        shuffleButton.setAttribute(
            "title",
            "Shuffle on"
        );


        shuffleButton.classList.add(
            "active"
        );

    } else {

        icon.textContent =
            "🔀";


        shuffleButton.setAttribute(
            "aria-label",
            "Shuffle off"
        );


        shuffleButton.setAttribute(
            "title",
            "Shuffle off"
        );


        shuffleButton.classList.remove(
            "active"
        );

    }

}


function shuffleTracks() {

    if (
        tracks.length <= 1
    ) {

        return;

    }


    const current =
        tracks[currentTrack];


    const remaining =
        tracks.filter(
            (
                track,
                index
            ) =>
                index !==
                currentTrack
        );


    for (
        let i =
            remaining.length - 1;
        i > 0;
        i--
    ) {

        const randomIndex =
            Math.floor(
                Math.random() *
                (i + 1)
            );


        [
            remaining[i],
            remaining[randomIndex]
        ] = [
            remaining[randomIndex],
            remaining[i]
        ];

    }


    tracks = [
        current,
        ...remaining
    ];


    currentTrack =
        0;


    createTrackList();

    updateActiveTrack();

    preloadNextTrack();

    updateMediaSession();

    updatePlayerDisplay();

}


/* =========================================================
   SHUFFLE BUTTON
========================================================= */

if (shuffleButton) {

    shuffleButton.addEventListener(
        "click",
        () => {

            shuffleEnabled =
                !shuffleEnabled;


            updateShuffleButton();


            if (
                shuffleEnabled
            ) {

                shuffleTracks();

            }

        }
    );

}


/* =========================================================
   VOLUME
========================================================= */

if (audio) {

    audio.volume =
        1;

}


if (volume) {

    volume.style.setProperty(
        "--volume",
        "100%"
    );


    volume.addEventListener(
        "input",
        () => {

            const value =
                Number(
                    volume.value
                );


            if (masterGain) {

                masterGain.gain.value =
                    value;

            }


            const percentage =
                Math.round(
                    value *
                    100
                );


            if (volumeValue) {

                volumeValue.textContent =
                    percentage +
                    "%";

            }


            volume.style.setProperty(
                "--volume",
                `${percentage}%`
            );


            if (!volumeIcon) {
                return;
            }


            if (
                percentage === 0
            ) {

                volumeIcon.textContent =
                    "🔇";

            } else if (
                percentage < 50
            ) {

                volumeIcon.textContent =
                    "🔉";

            } else {

                volumeIcon.textContent =
                    "🔊";

            }

        }
    );

}


/* =========================================================
   BUTTON EVENTS
========================================================= */

if (previousButton) {

    previousButton.addEventListener(
        "click",
        previousTrack
    );

}


if (nextButton) {

    nextButton.addEventListener(
        "click",
        nextTrack
    );

}


/*
 * The play button already has:
 *
 * onclick="togglePlay()"
 *
 * in your HTML, so we intentionally do
 * NOT attach another click listener here.
 */


/* =========================================================
   COLOR HELPERS
========================================================= */

function colorToString(
    color
) {

    return (
        Math.round(
            color[0]
        ) +
        ", " +
        Math.round(
            color[1]
        ) +
        ", " +
        Math.round(
            color[2]
        )
    );

}


/* =========================================================
   ANIMATE COVER COLORS
========================================================= */

function animateCoverColors(
    targetColor1,
    targetColor2,
    targetColor3
) {

    if (
        coverColorAnimationFrame
    ) {

        cancelAnimationFrame(
            coverColorAnimationFrame
        );

    }


    const startColor1 =
        [
            ...currentCoverColor1
        ];


    const startColor2 =
        [
            ...currentCoverColor2
        ];


    const startColor3 =
        [
            ...currentCoverColor3
        ];


    const startTime =
        performance.now();


    const transitionDuration =
        1800;


    function animate(
        now
    ) {

        const elapsed =
            now -
            startTime;


        const rawProgress =
            Math.min(
                elapsed /
                transitionDuration,
                1
            );


        const easedProgress =
            rawProgress < 0.5
                ? 2 *
                    rawProgress *
                    rawProgress
                : 1 -
                    Math.pow(
                        -2 *
                            rawProgress +
                            2,
                        2
                    ) /
                    2;


        const nextColor1 =
            startColor1.map(
                (
                    start,
                    index
                ) =>
                    start +
                    (
                        targetColor1[
                            index
                        ] -
                        start
                    ) *
                    easedProgress
            );


        const nextColor2 =
            startColor2.map(
                (
                    start,
                    index
                ) =>
                    start +
                    (
                        targetColor2[
                            index
                        ] -
                        start
                    ) *
                    easedProgress
            );


        const nextColor3 =
            startColor3.map(
                (
                    start,
                    index
                ) =>
                    start +
                    (
                        targetColor3[
                            index
                        ] -
                        start
                    ) *
                    easedProgress
            );


        const colorOneValue =
            colorToString(
                nextColor1
            );


        const colorTwoValue =
            colorToString(
                nextColor2
            );


        const colorThreeValue =
            colorToString(
                nextColor3
            );


        if (musicPlayer) {

            musicPlayer.style.setProperty(
                "--cover-color-1",
                colorOneValue
            );


            musicPlayer.style.setProperty(
                "--cover-color-2",
                colorTwoValue
            );

        }


        document.body.style.setProperty(
            "--cover-color-1",
            colorOneValue
        );


        document.body.style.setProperty(
            "--cover-color-2",
            colorTwoValue
        );


        document.body.style.setProperty(
            "--cover-color-3",
            colorThreeValue
        );


        if (
            rawProgress < 1
        ) {

            coverColorAnimationFrame =
                requestAnimationFrame(
                    animate
                );

        } else {

            currentCoverColor1 =
                [
                    ...targetColor1
                ];


            currentCoverColor2 =
                [
                    ...targetColor2
                ];


            currentCoverColor3 =
                [
                    ...targetColor3
                ];


            coverColorAnimationFrame =
                null;

        }

    }


    coverColorAnimationFrame =
        requestAnimationFrame(
            animate
        );

}


/* =========================================================
   ARTWORK COLORS
========================================================= */

function updatePlayerColors(
    imageSource
) {

    if (
        !musicPlayer ||
        !imageSource
    ) {

        return;

    }


    const image =
        new Image();


    image.crossOrigin =
        "anonymous";


    image.onload =
        () => {

            const canvas =
                document.createElement(
                    "canvas"
                );


            const context =
                canvas.getContext(
                    "2d",
                    {
                        willReadFrequently:
                            true
                    }
                );


            if (!context) {
                return;
            }


            canvas.width =
                80;


            canvas.height =
                80;


            context.drawImage(
                image,
                0,
                0,
                80,
                80
            );


            let imageData;


            try {

                imageData =
                    context.getImageData(
                        0,
                        0,
                        80,
                        80
                    ).data;

            } catch (error) {

                console.warn(
                    "Could not sample artwork colors:",
                    error
                );


                return;

            }


            const colors =
                [];


            for (
                let i = 0;
                i <
                    imageData.length;
                i += 16
            ) {

                const r =
                    imageData[i];


                const g =
                    imageData[i + 1];


                const b =
                    imageData[i + 2];


                const brightness =
                    (
                        r +
                        g +
                        b
                    ) / 3;


                const saturation =
                    Math.max(
                        r,
                        g,
                        b
                    ) -
                    Math.min(
                        r,
                        g,
                        b
                    );


                if (
                    brightness < 20
                ) {

                    continue;

                }


                if (
                    r > 235 &&
                    g > 235 &&
                    b > 235
                ) {

                    continue;

                }


                colors.push({
                    r,
                    g,
                    b,
                    saturation,
                    brightness
                });

            }


            colors.sort(
                (
                    a,
                    b
                ) =>
                    b.saturation -
                    a.saturation
            );


            const colorOne =
                colors[0] || {
                    r: 255,
                    g: 255,
                    b: 255
                };


            let colorTwo =
                colors.find(
                    color =>
                        Math.abs(
                            color.r -
                            colorOne.r
                        ) +
                        Math.abs(
                            color.g -
                            colorOne.g
                        ) +
                        Math.abs(
                            color.b -
                            colorOne.b
                        ) > 80
                );


            if (!colorTwo) {

                colorTwo =
                    colorOne;

            }


            let colorThree =
                colors.find(
                    color =>
                        color !==
                            colorOne &&
                        color !==
                            colorTwo &&
                        Math.abs(
                            color.r -
                            colorOne.r
                        ) +
                        Math.abs(
                            color.g -
                            colorOne.g
                        ) +
                        Math.abs(
                            color.b -
                            colorOne.b
                        ) > 40
                );


            if (!colorThree) {

                colorThree =
                    colorTwo;

            }


            animateCoverColors(
                [
                    colorOne.r,
                    colorOne.g,
                    colorOne.b
                ],
                [
                    colorTwo.r,
                    colorTwo.g,
                    colorTwo.b
                ],
                [
                    colorThree.r,
                    colorThree.g,
                    colorThree.b
                ]
            );

        };


    image.onerror =
        () => {

            const fallback =
                [
                    255,
                    255,
                    255
                ];


            animateCoverColors(
                fallback,
                fallback,
                fallback
            );

        };


    image.src =
        imageSource;

}


/* =========================================================
   FORMAT TIME
========================================================= */

function formatTime(
    seconds
) {

    if (
        !Number.isFinite(
            Number(seconds)
        ) ||
        Number(seconds) < 0
    ) {

        return "0:00";

    }


    const total =
        Math.floor(
            Number(seconds)
        );


    const minutes =
        Math.floor(
            total /
            60
        );


    const remainingSeconds =
        total %
        60;


    return (
        minutes +
        ":" +
        String(
            remainingSeconds
        ).padStart(
            2,
            "0"
        )
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   INITIAL STATE
========================================================= */

updateShuffleButton();

setPlayState(false);

clearLyrics();
