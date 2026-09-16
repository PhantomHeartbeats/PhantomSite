/* =========================================================
   PHANTOM HEARTBEATS — ADMIN CMS
   Supabase + Cloudflare R2
========================================================= */

const SUPABASE_URL =
    "https://wayjatvqnbqyzmwnbabp.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_UUx-z6V2gMIaEsedYj4ZBA_Q750jG2_";

const WORKER_URL =
    "https://phantom-heartbeats-api.3huvelyk.workers.dev";


const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );


// ============================================================
// DOM
// ============================================================

const loginScreen =
    document.getElementById("login-screen");

const adminScreen =
    document.getElementById("admin-screen");

const loginForm =
    document.getElementById("login-form");

const loginEmail =
    document.getElementById("email");

const loginPassword =
    document.getElementById("password");

const loginError =
    document.getElementById("login-error");

const logoutButton =
    document.getElementById("logout-button");

const releasesList =
    document.getElementById("release-list");

const newReleaseButton =
    document.getElementById("new-release-button");

const editor =
    document.getElementById("editor");

const editorTitle =
    document.getElementById("editor-title");

const editorEyebrow =
    document.getElementById("editor-eyebrow");

const releaseForm =
    document.getElementById("release-form");

const releaseIdInput =
    document.getElementById("release-id");

const releaseType =
    document.getElementById("release-type");

const releaseTitle =
    document.getElementById("release-title");

const releaseArtists =
    document.getElementById("release-artists");

const releaseDate =
    document.getElementById("release-date");

const releasePublished =
    document.getElementById("release-published");

const coverFile =
    document.getElementById("cover-file");

const coverCurrent =
    document.getElementById("cover-current");

const tracksContainer =
    document.getElementById("track-editor-list");

const addTrackButton =
    document.getElementById("add-track-button");

const cancelButton =
    document.getElementById("cancel-button");

const closeEditorButton =
    document.getElementById("close-editor");

const saveMessage =
    document.getElementById("save-message");

const deleteReleaseButton =
    document.getElementById(
        "delete-release-button"
    );


// ============================================================
// STATE
// ============================================================

let currentRelease = null;

let releases = [];


// ============================================================
// HELPERS
// ============================================================

function formatReleaseType(
    type
) {

    switch (
        String(type || "").toLowerCase()
    ) {

        case "album":
            return "Album";

        case "ep":
            return "EP";

        case "single":
            return "Single";

        case "featured":
            return "Featured";

        default:
            return String(type || "");

    }

}


// ============================================================
// AUTH
// ============================================================

async function checkSession() {

    try {

        const {
            data: {
                session
            },
            error
        } =
            await supabaseClient
                .auth
                .getSession();


        if (error) {

            console.error(
                "Session error:",
                error
            );

            showLogin();

            loginError.textContent =
                `Session error: ${error.message}`;

            return;

        }


        if (!session) {

            showLogin();

            return;

        }


        console.log(
            "Existing session:",
            session.user.id
        );


        const isAdmin =
            await verifyAdmin(
                session
            );


        if (!isAdmin) {

            await supabaseClient
                .auth
                .signOut();

            showLogin();

            loginError.textContent =
                "You are not authorized as an admin.";

            return;

        }


        showAdmin();

        await loadReleases();

    } catch (error) {

        console.error(
            "Session check error:",
            error
        );

        showLogin();

        loginError.textContent =
            `Session error: ${error.message}`;

    }

}


async function verifyAdmin(
    session
) {

    if (!session?.user?.id) {

        console.error(
            "No valid session/user."
        );

        return false;

    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from("admin_users")
            .select("user_id")
            .eq(
                "user_id",
                session.user.id
            )
            .maybeSingle();


    if (error) {

        console.error(
            "Admin verification error:",
            error
        );

        return false;

    }


    return !!data;

}


async function getAccessToken() {

    const {
        data: {
            session
        }
    } =
        await supabaseClient
            .auth
            .getSession();


    if (!session) {

        throw new Error(
            "Not logged in."
        );

    }


    return session.access_token;

}


// ============================================================
// LOGIN
// ============================================================

loginForm.addEventListener(
    "submit",
    async (
        event
    ) => {

        event.preventDefault();


        loginError.textContent =
            "";


        const email =
            loginEmail.value.trim();


        const password =
            loginPassword.value;


        if (!email || !password) {

            loginError.textContent =
                "Enter your email and password.";

            return;

        }


        loginForm.classList.add(
            "loading"
        );


        try {

            const {
                data,
                error
            } =
                await supabaseClient
                    .auth
                    .signInWithPassword({
                        email,
                        password
                    });


            if (error) {

                console.error(
                    "Supabase login error:",
                    error
                );


                loginError.textContent =
                    `Login failed: ${error.message}`;


                return;

            }


            if (!data.session) {

                loginError.textContent =
                    "Login succeeded, but no session was created.";


                return;

            }


            const isAdmin =
                await verifyAdmin(
                    data.session
                );


            if (!isAdmin) {

                await supabaseClient
                    .auth
                    .signOut();


                loginError.textContent =
                    "Login worked, but this account is not authorized as an admin.";


                return;

            }


            showAdmin();

            await loadReleases();

        } catch (error) {

            console.error(
                "Unexpected login error:",
                error
            );


            loginError.textContent =
                `Login error: ${error.message}`;

        } finally {

            loginForm.classList.remove(
                "loading"
            );

        }

    }
);


// ============================================================
// LOGOUT
// ============================================================

logoutButton.addEventListener(
    "click",
    async () => {

        await supabaseClient
            .auth
            .signOut();


        currentRelease =
            null;


        editor.classList.add(
            "hidden"
        );


        showLogin();

    }
);


// ============================================================
// UI
// ============================================================

function showLogin() {

    loginScreen.classList.remove(
        "hidden"
    );


    adminScreen.classList.add(
        "hidden"
    );

}


function showAdmin() {

    loginScreen.classList.add(
        "hidden"
    );


    adminScreen.classList.remove(
        "hidden"
    );

}


// ============================================================
// RELEASES
// ============================================================

async function loadReleases() {

    releasesList.innerHTML = `
        <div class="loading">
            LOADING...
        </div>
    `;


    const {
        data,
        error
    } =
        await supabaseClient
            .from("releases")
            .select("*")
            .order(
                "release_date",
                {
                    ascending: false,
                    nullsFirst: false
                }
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(
            "Load releases error:",
            error
        );


        releasesList.innerHTML = `
            <div class="error">
                FAILED TO LOAD RELEASES.
            </div>
        `;


        return;

    }


    releases =
        data || [];


    renderReleases();

}


function renderReleases() {

    if (!releases.length) {

        releasesList.innerHTML = `
            <div class="loading">
                NO RELEASES YET.
            </div>
        `;


        return;

    }


    releasesList.innerHTML =
        "";


    releases.forEach(
        (
            release
        ) => {

            const item =
                document.createElement(
                    "button"
                );


            item.type =
                "button";


            item.className =
                "release-item";


            item.innerHTML = `

                <div class="release-item-main">

                    <div class="release-item-title">
                        ${escapeHtml(
                            release.title
                        )}
                    </div>

                    <div class="release-item-meta">

                        ${escapeHtml(
                            formatReleaseType(
                                release.type
                            )
                        )}

                        ${
                            release.release_date
                                ? ` · ${escapeHtml(
                                    formatDate(
                                        release.release_date
                                    )
                                )}`
                                : ""
                        }

                    </div>

                </div>


                <div class="release-item-status ${
                    release.published
                        ? "published"
                        : "draft"
                }">

                    ${
                        release.published
                            ? "Published"
                            : "Draft"
                    }

                </div>

            `;


            item.addEventListener(
                "click",
                () => {

                    openRelease(
                        release.id
                    );

                }
            );


            releasesList.appendChild(
                item
            );

        }
    );

}


// ============================================================
// NEW RELEASE
// ============================================================

newReleaseButton.addEventListener(
    "click",
    () => {

        currentRelease =
            null;


        releaseIdInput.value =
            "";


        editorEyebrow.textContent =
            "NEW RELEASE";


        editorTitle.textContent =
            "CREATE RELEASE";


        releaseType.value =
            "album";


        releaseTitle.value =
            "";


        releaseArtists.value =
            "Phantom Heartbeats";


        releaseDate.value =
            "";


        releasePublished.checked =
            false;


        coverFile.value =
            "";


        coverCurrent.textContent =
            "No cover uploaded.";


        tracksContainer.innerHTML = `
            <div class="empty-tracks">
                NO TRACKS YET
            </div>
        `;


        addTrack();


        if (deleteReleaseButton) {

            deleteReleaseButton.disabled =
                true;

        }


        editor.classList.remove(
            "hidden"
        );


        releaseTitle.focus();

    }
);


// ============================================================
// OPEN RELEASE
// ============================================================

async function openRelease(
    releaseId
) {

    const release =
        releases.find(
            item =>
                item.id === releaseId
        );


    if (!release) {
        return;
    }


    currentRelease =
        release;


    releaseIdInput.value =
        release.id;


    editorEyebrow.textContent =
        "EDIT RELEASE";


    editorTitle.textContent =
        "EDIT RELEASE";


    releaseType.value =
        release.type ||
        "album";


    releaseTitle.value =
        release.title ||
        "";


    releaseArtists.value =
        release.artists ||
        "Phantom Heartbeats";


    releaseDate.value =
        release.release_date ||
        "";


    releasePublished.checked =
        !!release.published;


    coverFile.value =
        "";


    coverCurrent.textContent =
        release.cover_url
            ? "Current cover uploaded."
            : "No cover uploaded.";


    if (deleteReleaseButton) {

        deleteReleaseButton.disabled =
            false;

    }


    tracksContainer.innerHTML = `
        <div class="loading">
            LOADING TRACKS...
        </div>
    `;


    editor.classList.remove(
        "hidden"
    );


    const {
        data: tracks,
        error
    } =
        await supabaseClient
            .from("tracks")
            .select("*")
            .eq(
                "release_id",
                release.id
            )
            .order(
                "disc_number",
                {
                    ascending: true
                }
            )
            .order(
                "track_number",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "Load tracks error:",
            error
        );


        tracksContainer.innerHTML = `
            <div class="error">
                FAILED TO LOAD TRACKS.
            </div>
        `;


        return;

    }


    tracksContainer.innerHTML =
        "";


    if (!tracks?.length) {

        addTrack();

        return;

    }


    tracks.forEach(
        (
            track
        ) => {

            addTrack(
                track
            );

        }
    );

}


// ============================================================
// TRACK EDITOR
// ============================================================

addTrackButton.addEventListener(
    "click",
    () => {

        addTrack();

    }
);


function addTrack(
    track = null
) {

    const existingRows =
        tracksContainer.querySelectorAll(
            ".track-row"
        );


    const index =
        existingRows.length;


    const emptyMessage =
        tracksContainer.querySelector(
            ".empty-tracks"
        );


    if (emptyMessage) {

        emptyMessage.remove();

    }


    const row =
        document.createElement(
            "div"
        );


    row.className =
        "track-row";


    if (track?.id) {

        row.dataset.trackId =
            track.id;

    }


    if (track?.audio_url) {

        row.dataset.audioUrl =
            track.audio_url;

    }


    row.innerHTML = `

        <div class="track-number">
            ${index + 1}
        </div>


        <div class="track-fields">

            <div class="form-group">

                <label>
                    DISC
                </label>

                <input
                    type="number"
                    class="track-disc"
                    min="1"
                    step="1"
                    value="${escapeAttribute(
                        track?.disc_number ?? 1
                    )}"
                >

            </div>


            <div class="form-group">

                <label>
                    TITLE
                </label>

                <input
                    type="text"
                    class="track-title"
                    value="${escapeAttribute(
                        track?.title || ""
                    )}"
                    placeholder="Track title"
                >

            </div>


            <div class="form-group">

                <label>
                    ARTISTS
                </label>

                <input
                    type="text"
                    class="track-artists"
                    value="${escapeAttribute(
                        track?.artists ||
                        "Phantom Heartbeats"
                    )}"
                    placeholder="Phantom Heartbeats"
                >

            </div>


            <div class="form-group full">

                <label>
                    AUDIO
                </label>

                <input
                    type="file"
                    class="track-audio"
                    accept="audio/flac,audio/*,.flac,.wav"
                >


                <div class="track-current">

                    ${
                        track?.audio_url
                            ? "Current audio uploaded."
                            : "No audio uploaded."
                    }

                </div>

            </div>

        </div>


        <button
            type="button"
            class="remove-track"
        >
            REMOVE
        </button>

    `;


    const removeButton =
        row.querySelector(
            ".remove-track"
        );


    removeButton.addEventListener(
        "click",
        async () => {

            await removeTrackRow(
                row
            );

        }
    );


    tracksContainer.appendChild(
        row
    );


    renumberTracks();

}


function renumberTracks() {

    const rows =
        tracksContainer.querySelectorAll(
            ".track-row"
        );


    const discCounters = {};


    rows.forEach(
        (
            row
        ) => {

            const discInput =
                row.querySelector(
                    ".track-disc"
                );


            const disc =
                Math.max(
                    1,
                    parseInt(
                        discInput?.value,
                        10
                    ) || 1
                );


            if (
                !discCounters[disc]
            ) {

                discCounters[disc] =
                    0;

            }


            discCounters[disc]++;


            const number =
                row.querySelector(
                    ".track-number"
                );


            if (number) {

                number.textContent =
                    discCounters[disc];

            }

        }
    );

}


// ============================================================
// REMOVE INDIVIDUAL TRACK
// ============================================================

async function removeTrackRow(
    row
) {

    if (!row) {
        return;
    }


    const trackId =
        row.dataset.trackId ||
        null;


    const audioUrl =
        row.dataset.audioUrl ||
        null;


    const titleInput =
        row.querySelector(
            ".track-title"
        );


    const trackTitle =
        titleInput?.value.trim() ||
        "this track";


    if (!trackId) {

        row.remove();

        renumberTracks();


        if (
            !tracksContainer.querySelector(
                ".track-row"
            )
        ) {

            addEmptyTrackMessage();

        }


        return;

    }


    const confirmed =
        window.confirm(
            `Permanently delete "${trackTitle}"?\n\n` +
            "This removes the track from the database and deletes its audio file from storage."
        );


    if (!confirmed) {
        return;
    }


    removeButtonLoading(
        row,
        true
    );


    try {

        const {
            error
        } =
            await supabaseClient
                .from("tracks")
                .delete()
                .eq(
                    "id",
                    trackId
                );


        if (error) {
            throw error;
        }


        if (audioUrl) {

            await deleteR2FileFromUrl(
                audioUrl,
                true
            );

        }


        row.remove();


        renumberTracks();


        if (
            !tracksContainer.querySelector(
                ".track-row"
            )
        ) {

            addEmptyTrackMessage();

        }


        showSaveMessage(
            `"${trackTitle}" deleted.`
        );


    } catch (error) {

        console.error(
            "Track deletion failed:",
            error
        );


        showSaveMessage(
            `Could not delete track: ${error.message}`,
            true
        );


        removeButtonLoading(
            row,
            false
        );

    }

}


function addEmptyTrackMessage() {

    if (
        tracksContainer.querySelector(
            ".track-row"
        )
    ) {
        return;
    }


    tracksContainer.innerHTML = `
        <div class="empty-tracks">
            NO TRACKS YET
        </div>
    `;

}


function removeButtonLoading(
    row,
    loading
) {

    const button =
        row.querySelector(
            ".remove-track"
        );


    if (!button) {
        return;
    }


    if (loading) {

        button.disabled =
            true;

        button.textContent =
            "DELETING...";

    } else {

        button.disabled =
            false;

        button.textContent =
            "REMOVE";

    }

}


// ============================================================
// DELETE RELEASE
// ============================================================

if (deleteReleaseButton) {

    deleteReleaseButton.addEventListener(
        "click",
        async () => {

            if (!currentRelease?.id) {

                showSaveMessage(
                    "No saved release is currently open.",
                    true
                );

                return;

            }


            const releaseId =
                currentRelease.id;


            const title =
                currentRelease.title ||
                releaseTitle.value.trim() ||
                "this release";


            const confirmed =
                window.confirm(
                    `DELETE "${title}"?\n\n` +
                    "This will permanently delete:\n" +
                    "• the release\n" +
                    "• all tracks\n" +
                    "• all track audio files\n" +
                    "• the cover\n\n" +
                    "THIS CANNOT BE UNDONE."
                );


            if (!confirmed) {
                return;
            }


            deleteReleaseButton.disabled =
                true;


            deleteReleaseButton.textContent =
                "DELETING...";


            try {

                const {
                    data: tracks,
                    error: tracksError
                } =
                    await supabaseClient
                        .from("tracks")
                        .select(
                            "id, audio_url"
                        )
                        .eq(
                            "release_id",
                            releaseId
                        );


                if (tracksError) {
                    throw tracksError;
                }


                for (
                    const track
                    of tracks || []
                ) {

                    if (
                        track.audio_url
                    ) {

                        await deleteR2FileFromUrl(
                            track.audio_url,
                            true
                        );

                    }

                }


                if (
                    currentRelease.cover_url
                ) {

                    await deleteR2FileFromUrl(
                        currentRelease.cover_url,
                        true
                    );

                }


                const {
                    error: releaseError
                } =
                    await supabaseClient
                        .from("releases")
                        .delete()
                        .eq(
                            "id",
                            releaseId
                        );


                if (releaseError) {
                    throw releaseError;
                }


                currentRelease =
                    null;


                releaseIdInput.value =
                    "";


                editor.classList.add(
                    "hidden"
                );


                await loadReleases();


            } catch (error) {

                console.error(
                    "Delete release error:",
                    error
                );


                showSaveMessage(
                    `Delete failed: ${error.message}`,
                    true
                );


            } finally {

                deleteReleaseButton.disabled =
                    false;


                deleteReleaseButton.textContent =
                    "DELETE RELEASE";

            }

        }
    );

}


// ============================================================
// SAVE
// ============================================================

releaseForm.addEventListener(
    "submit",
    async (
        event
    ) => {

        event.preventDefault();


        saveMessage.textContent =
            "";


        const saveButton =
            releaseForm.querySelector(
                'button[type="submit"]'
            );


        try {

            saveButton.disabled =
                true;


            saveButton.textContent =
                "SAVING...";


            await saveRelease();


            await loadReleases();


            editor.classList.add(
                "hidden"
            );


        } catch (error) {

            console.error(
                "Save error:",
                error
            );


            saveMessage.textContent =
                error.message ||
                "Something went wrong while saving.";


        } finally {

            saveButton.disabled =
                false;


            saveButton.textContent =
                "SAVE RELEASE";

        }

    }
);


// ============================================================
// SAVE RELEASE
// ============================================================

async function saveRelease() {

    const title =
        releaseTitle.value.trim();


    if (!title) {

        throw new Error(
            "Release title is required."
        );

    }


    const type =
        releaseType.value;


    const artists =
        releaseArtists.value.trim() ||
        "Phantom Heartbeats";


    const releaseDateValue =
        releaseDate.value ||
        null;


    const published =
        releasePublished.checked;


    let releaseId;


    // --------------------------------------------------------
    // CREATE / UPDATE RELEASE
    // --------------------------------------------------------

    if (currentRelease) {

        const {
            error
        } =
            await supabaseClient
                .from("releases")
                .update({
                    type,
                    title,
                    artists,
                    release_date:
                        releaseDateValue,
                    published
                })
                .eq(
                    "id",
                    currentRelease.id
                );


        if (error) {
            throw error;
        }


        releaseId =
            currentRelease.id;

    } else {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("releases")
                .insert({
                    type,
                    title,
                    artists,
                    release_date:
                        releaseDateValue,
                    published
                })
                .select()
                .single();


        if (error) {
            throw error;
        }


        releaseId =
            data.id;


        currentRelease =
            data;

    }


    // --------------------------------------------------------
    // COVER
    // --------------------------------------------------------

    const selectedCover =
        coverFile.files[0];


    if (selectedCover) {

        const newCoverUrl =
            await uploadFile(
                selectedCover,
                `covers/${releaseId}`
            );


        const oldCoverUrl =
            currentRelease.cover_url;


        const {
            error
        } =
            await supabaseClient
                .from("releases")
                .update({
                    cover_url:
                        newCoverUrl
                })
                .eq(
                    "id",
                    releaseId
                );


        if (error) {
            throw error;
        }


        if (
            oldCoverUrl &&
            oldCoverUrl !== newCoverUrl
        ) {

            await deleteR2FileFromUrl(
                oldCoverUrl
            );

        }


        currentRelease.cover_url =
            newCoverUrl;

    }


    // --------------------------------------------------------
    // LOAD EXISTING TRACKS
    // --------------------------------------------------------

    const {
        data: oldTracks,
        error: oldTracksError
    } =
        await supabaseClient
            .from("tracks")
            .select("*")
            .eq(
                "release_id",
                releaseId
            );


    if (oldTracksError) {
        throw oldTracksError;
    }


    // --------------------------------------------------------
    // READ EDITOR ROWS
    // --------------------------------------------------------

    const rows =
        Array.from(
            tracksContainer.querySelectorAll(
                ".track-row"
            )
        );


    const keptTrackIds =
        new Set();


    for (
        let index = 0;
        index < rows.length;
        index++
    ) {

        const row =
            rows[index];


        const titleInput =
            row.querySelector(
                ".track-title"
            );


        const artistsInput =
            row.querySelector(
                ".track-artists"
            );


        const discInput =
            row.querySelector(
                ".track-disc"
            );


        const audioInput =
            row.querySelector(
                ".track-audio"
            );


        const trackTitle =
            titleInput.value.trim();


        const trackArtists =
            artistsInput.value.trim() ||
            "Phantom Heartbeats";


        const discNumber =
            Math.max(
                1,
                parseInt(
                    discInput?.value,
                    10
                ) || 1
            );


        if (!trackTitle) {

            throw new Error(
                `Track ${index + 1} needs a title.`
            );

        }


        const trackId =
            row.dataset.trackId ||
            null;


        let oldTrack =
            null;


        if (trackId) {

            oldTrack =
                oldTracks?.find(
                    track =>
                        track.id ===
                        trackId
                ) || null;

        }


        if (
            !oldTrack &&
            !trackId
        ) {

            oldTrack =
                oldTracks?.find(
                    track =>
                        track.track_number ===
                            index + 1 &&
                        Number(
                            track.disc_number || 1
                        ) ===
                            discNumber
                ) || null;

        }


        let audioUrl =
            oldTrack?.audio_url ||
            row.dataset.audioUrl ||
            null;


        let durationSeconds =
            oldTrack?.duration_seconds ||
            null;


        const selectedAudio =
            audioInput.files[0];


        // ----------------------------------------------------
        // REPLACE AUDIO
        // ----------------------------------------------------

        if (selectedAudio) {

            durationSeconds =
                await getAudioDuration(
                    selectedAudio
                );


            const newAudioUrl =
                await uploadFile(
                    selectedAudio,
                    `audio/${releaseId}`
                );


            const oldAudioUrl =
                audioUrl;


            audioUrl =
                newAudioUrl;


            if (
                oldAudioUrl &&
                oldAudioUrl !==
                    newAudioUrl
            ) {

                await deleteR2FileFromUrl(
                    oldAudioUrl
                );

            }

        }


        // ----------------------------------------------------
        // EXISTING TRACK
        // ----------------------------------------------------

        if (oldTrack) {

            const {
                error
            } =
                await supabaseClient
                    .from("tracks")
                    .update({
                        track_number:
                            index + 1,

                        disc_number:
                            discNumber,

                        title:
                            trackTitle,

                        artists:
                            trackArtists,

                        audio_url:
                            audioUrl,

                        duration_seconds:
                            durationSeconds
                    })
                    .eq(
                        "id",
                        oldTrack.id
                    );


            if (error) {
                throw error;
            }


            keptTrackIds.add(
                oldTrack.id
            );


            row.dataset.trackId =
                oldTrack.id;


            if (audioUrl) {

                row.dataset.audioUrl =
                    audioUrl;

            }

        }


        // ----------------------------------------------------
        // NEW TRACK
        // ----------------------------------------------------

        else {

            const {
                data: insertedTrack,
                error
            } =
                await supabaseClient
                    .from("tracks")
                    .insert({
                        release_id:
                            releaseId,

                        track_number:
                            index + 1,

                        disc_number:
                            discNumber,

                        title:
                            trackTitle,

                        artists:
                            trackArtists,

                        audio_url:
                            audioUrl,

                        duration_seconds:
                            durationSeconds
                    })
                    .select()
                    .single();


            if (error) {
                throw error;
            }


            keptTrackIds.add(
                insertedTrack.id
            );


            row.dataset.trackId =
                insertedTrack.id;


            if (audioUrl) {

                row.dataset.audioUrl =
                    audioUrl;

            }

        }

    }


    // --------------------------------------------------------
    // DELETE TRACKS REMOVED FROM EDITOR
    // --------------------------------------------------------

    for (
        const oldTrack
        of oldTracks || []
    ) {

        if (
            !keptTrackIds.has(
                oldTrack.id
            )
        ) {

            const {
                error
            } =
                await supabaseClient
                    .from("tracks")
                    .delete()
                    .eq(
                        "id",
                        oldTrack.id
                    );


            if (error) {

                console.warn(
                    "Could not delete old track:",
                    error
                );

            }


            if (
                oldTrack.audio_url
            ) {

                await deleteR2FileFromUrl(
                    oldTrack.audio_url
                );

            }

        }

    }


    renumberTracks();


    saveMessage.textContent =
        "Release saved successfully.";

}


// ============================================================
// CANCEL / CLOSE
// ============================================================

cancelButton.addEventListener(
    "click",
    () => {

        currentRelease =
            null;


        editor.classList.add(
            "hidden"
        );

    }
);


closeEditorButton.addEventListener(
    "click",
    () => {

        currentRelease =
            null;


        editor.classList.add(
            "hidden"
        );

    }
);


// ============================================================
// R2 UPLOAD
// ============================================================

async function uploadFile(
    file,
    folder
) {

    if (!file) {

        throw new Error(
            "No file selected."
        );

    }


    const token =
        await getAccessToken();


    const extension =
        getFileExtension(
            file
        );


    const safeName =
        sanitizeFilename(
            removeExtension(
                file.name
            )
        ) ||
        "file";


    const timestamp =
        Date.now();


    const objectKey =
        `${folder}/${safeName}-${timestamp}.${extension}`;


    const response =
        await fetch(
            `${WORKER_URL}/upload?key=${encodeURIComponent(
                objectKey
            )}`,
            {
                method:
                    "POST",

                headers: {

                    Authorization:
                        `Bearer ${token}`,

                    "Content-Type":
                        file.type ||
                        getMimeType(
                            extension
                        )

                },

                body:
                    file
            }
        );


    if (!response.ok) {

        let message =
            "Upload failed.";


        try {

            const data =
                await response.json();


            if (data.error) {

                message =
                    data.error;

            }

        } catch {
            // Ignore response parsing error
        }


        throw new Error(
            message
        );

    }


    return (
        `${WORKER_URL}/file?key=` +
        encodeURIComponent(
            objectKey
        )
    );

}


// ============================================================
// R2 DELETE
// ============================================================

async function deleteR2FileFromUrl(
    fileUrl,
    throwOnError = false
) {

    if (!fileUrl) {
        return;
    }


    try {

        const parsed =
            new URL(
                fileUrl
            );


        const objectKey =
            parsed.searchParams.get(
                "key"
            );


        if (!objectKey) {
            return;
        }


        const token =
            await getAccessToken();


        const response =
            await fetch(
                `${WORKER_URL}/file?key=${encodeURIComponent(
                    objectKey
                )}`,
                {
                    method:
                        "DELETE",

                    headers: {

                        Authorization:
                            `Bearer ${token}`

                    }

                }
            );


        if (!response.ok) {

            let message =
                "Failed to delete R2 object.";


            try {

                const data =
                    await response.json();


                if (data.error) {

                    message =
                        data.error;

                }

            } catch {
                // Ignore response parsing error
            }


            if (throwOnError) {

                throw new Error(
                    message
                );

            }


            console.warn(
                message,
                objectKey
            );

        }

    } catch (error) {

        if (throwOnError) {

            throw error;

        }


        console.warn(
            "R2 delete error:",
            error
        );

    }

}


// ============================================================
// FILE EXTENSION
// ============================================================

function getFileExtension(
    file
) {

    const filename =
        file.name || "";


    const parts =
        filename.split(".");


    if (
        parts.length > 1
    ) {

        return parts
            .pop()
            .toLowerCase();

    }


    switch (
        file.type
    ) {

        case "audio/flac":
            return "flac";

        case "audio/wav":
        case "audio/x-wav":
            return "wav";

        case "audio/mpeg":
            return "mp3";

        case "audio/mp4":
            return "m4a";

        case "image/jpeg":
            return "jpg";

        case "image/png":
            return "png";

        case "image/webp":
            return "webp";

        default:
            return "bin";

    }

}


// ============================================================
// MIME TYPE
// ============================================================

function getMimeType(
    extension
) {

    switch (
        extension.toLowerCase()
    ) {

        case "flac":
            return "audio/flac";

        case "wav":
            return "audio/wav";

        case "mp3":
            return "audio/mpeg";

        case "m4a":
            return "audio/mp4";

        case "jpg":
        case "jpeg":
            return "image/jpeg";

        case "png":
            return "image/png";

        case "webp":
            return "image/webp";

        default:
            return "application/octet-stream";

    }

}


// ============================================================
// AUDIO DURATION
// ============================================================

function getAudioDuration(
    file
) {

    return new Promise(
        resolve => {

            const audio =
                document.createElement(
                    "audio"
                );


            const objectUrl =
                URL.createObjectURL(
                    file
                );


            audio.preload =
                "metadata";


            audio.addEventListener(
                "loadedmetadata",
                () => {

                    const trackDuration =
                        Number.isFinite(
                            audio.duration
                        )
                            ? Math.round(
                                audio.duration
                            )
                            : null;


                    URL.revokeObjectURL(
                        objectUrl
                    );


                    resolve(
                        trackDuration
                    );

                }
            );


            audio.addEventListener(
                "error",
                () => {

                    URL.revokeObjectURL(
                        objectUrl
                    );


                    resolve(
                        null
                    );

                }
            );


            audio.src =
                objectUrl;

        }
    );

}


// ============================================================
// FILENAME HELPERS
// ============================================================

function removeExtension(
    filename
) {

    const lastDot =
        filename.lastIndexOf(".");


    if (
        lastDot <= 0
    ) {

        return filename;

    }


    return filename.slice(
        0,
        lastDot
    );

}


function sanitizeFilename(
    filename
) {

    return filename

        .normalize(
            "NFKD"
        )

        .replace(
            /[\u0300-\u036f]/g,
            ""
        )

        .replace(
            /[^a-zA-Z0-9_-]+/g,
            "-"
        )

        .replace(
            /^-+|-+$/g,
            ""
        )

        .toLowerCase();

}


// ============================================================
// DISPLAY HELPERS
// ============================================================

function formatDate(
    dateString
) {

    if (!dateString) {
        return "";
    }


    const date =
        new Date(
            `${dateString}T00:00:00`
        );


    return date.toLocaleDateString(
        "en-US",
        {
            year:
                "numeric",

            month:
                "short",

            day:
                "numeric"
        }
    );

}


function showSaveMessage(
    message,
    isError = false
) {

    if (!saveMessage) {
        return;
    }


    saveMessage.textContent =
        message;


    saveMessage.classList.toggle(
        "error",
        isError
    );

}


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


function escapeAttribute(
    value
) {

    return escapeHtml(
        value
    );

}


// ============================================================
// INITIALIZE
// ============================================================

showLogin();

if (deleteReleaseButton) {

    deleteReleaseButton.disabled =
        true;

}

checkSession();
