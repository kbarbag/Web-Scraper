require('./server.js');
const { Jsonh } = require('./utils/jsonh.js');
const { DB } = require('./utils/mongo.js');

const defaultUserFields = { scanned_all: false, scanned_profile: false, scanned_followers: false, scanned_collections: false, scanned_favorite_tracks: false, scanned_following: false, scanned_liked: false, scanned_liked_mixes: false, scanned_mixes: false, scanned_listen_later: false, scanned_listened: false };
const defaultFields = { scanned: false };
const minDelayTimeMS = 2000;
const maxDelayTimeMS = 4500;
const sortUser = [['public_mixes_count', -1], ['liked_mixes_count', -1], ['likes_received_count', -1], ['followers_count', -1], ['favorites_count', -1], ['follows_count', -1]];

let myDb = new DB();
let myJsonh = new Jsonh();
let data;
let tempData;
let queue = [];
let playlistQueue = [];
let randMs = 500;
console.log('start');
const wait = function (ms) {
    return new Promise((resolve) => {
        return setTimeout(resolve, ms);
    });
}
let curr;

(async () => {
    //grab first X unscanned users
    await myDb.connect();
    queue = await myDb.getData({ collection: 'users', args: { scanned_all: false }, options: { limit: 100, sort: sortUser } });
    queue.forEach(user => {
        //we don't want to update either of these values in the database
        delete user._id;
        delete user.id;
        queue.push(user);
    });

    while (queue.length > 0) {
        randMs = Math.ceil(Math.random() * 2000) + 1000;
        curr = queue.shift();
        await wait(randMs).then(async () => {
            if (!curr || !curr.login) {
                throw new Error('login field must be specified');
            }
            console.log(`Get profile for ${curr.login}`);
            if (curr.scanned_profile) return curr;
            data = await myJsonh.getJson(`https://8tracks.com${curr.path}.jsonh`);
            let newObj = await setUserObject('users', { login: data.user.login }, data.user, defaultUserFields);
            newObj.scanned_profile = true;
            await myDb.updateOrInsertData({ collection: 'users', args: { $set: { ...newObj } }, query: { login: newObj.login } });
            return newObj;
        }).then(async (data) => {
            console.log(`Get followers for ${data.login}`);
            if (data.scanned_followers) return data;
            await fetchAndSaveData({
                url: `https://8tracks.com${data.path}/followers?include=pagination&format=jsonh`,
                user: data.login,
                pageCollection: 'followers_searched'
            });
            await myDb.updateOrInsertData({ collection: 'users', query: { login: `${data.login}` }, args: { $set: { scanned_followers: true } } });
            return data;
        }).then(async (data) => {
            console.log(`Get following for ${data.login}`);
            if (data.scanned_following) return data;
            await fetchAndSaveData({
                url: `https://8tracks.com${data.path}/following?include=pagination&format=jsonh`,
                user: data.login,
                pageCollection: 'following_searched',
                queue
            });
            await myDb.updateOrInsertData({ collection: 'users', query: { login: `${data.login}` }, args: { $set: { scanned_following: true } } });
            return data;
        }).then(async (data) => {
            console.log(`Get liked mixes for ${data.login}`);
            if (data.scanned_liked_mixes) return data;
            await fetchAndSaveData({
                url: `https://8tracks.com${data.path}/liked_mixes?include=pagination&format=jsonh`,
                user: data.login,
                pageCollection: 'user_liked_playlists_searched',
                playlists: playlistQueue
            });
            await myDb.updateOrInsertData({ collection: 'users', query: { login: `${data.login}` }, args: { $set: { scanned_liked_mixes: true } } });
            return data;
        }).then(async (data) => {
            console.log(`Get mixes for ${data.login}`);
            if (data.scanned_mixes) return data;
            await fetchAndSaveData({
                url: `https://8tracks.com${data.path}/mixes?include=pagination&format=jsonh`,
                user: data.login,
                pageCollection: 'user_mixes_searched',
                playlists: playlistQueue
            });
            await myDb.updateOrInsertData({ collection: 'users', query: { login: `${data.login}` }, args: { $set: { scanned_mixes: true } } });
            return data;
        }).then(async (data) => {
            console.log(`Get collections for ${data.login}`);
            if (data.scanned_collections) return data;
            await fetchAndSaveData({
                url: `https://8tracks.com${data.path}/collections?include=pagination&format=jsonh`,
                user: data.login,
                pageCollection: 'user_collections_searched',
                playlists: playlistQueue
            });
            await myDb.updateOrInsertData({ collection: 'users', query: { login: `${data.login}` }, args: { $set: { scanned_collections: true } } });
            return data;
        }).then(async (data) => {
            console.log(`Get favorite tracks for ${data.login}`);
            if (data.scanned_favorite_tracks) return data;
            await fetchAndSaveData({
                url: `https://8tracks.com${data.path}/favorite_tracks?include=pagination&format=jsonh`,
                user: data.login,
                pageCollection: 'user_favorite_tracks_searched'
            });
            await myDb.updateOrInsertData({ collection: 'users', query: { login: `${data.login}` }, args: { $set: { scanned_favorite_tracks: true } } });
            return data;
        }).then(async (data) => {
            console.log(`Get tracks for playlist`);
            let tempPlaylist;
            while (playlistQueue.length > 0) {
                randMs = setRandMs(minDelayTimeMS, maxDelayTimeMS);
                await wait(randMs).then(async () => {
                    console.log('randMs: ', randMs);
                    randMs = setRandMs(minDelayTimeMS, maxDelayTimeMS);
                    tempPlaylist = playlistQueue.shift();
                    tempData = await myJsonh.getJson(`https://8tracks.com${tempPlaylist.path}?include=pagination,details&format=jsonh`);
                    await myDb.updateOrInsertData({ collection: 'playlists', query: { id: tempData.mix.id }, args: { $set: { ...tempData.mix } } });
                    await wait(randMs).then(() => true);
                    let newUser = await setUserObject('users', { login: tempData.mix.user.login }, { login: tempData.mix.user.login, path: tempData.mix.user.path }, defaultUserFields);
                    if (newUser.scanned_profile === false) {
                        if (queue.length < 100) { queue.push(newUser); }
                        await myDb.updateOrInsertData({ collection: 'users', query: { login: tempData.mix.user.login }, args: { $set: { ...newUser } } });
                    }
                    tempData = await myJsonh.getJson(`https://8tracks.com${tempPlaylist.path}/tracks_for_international?include=pagination,details&format=jsonh`);
                    await myDb.updateOrInsertData({ collection: 'playlists', query: { id: tempData.id }, args: { $set: { tracks: tempData.tracks, scanned_mix: true, scanned_tracks: true } } });
                    for (let i = 0; i < tempData.tracks.length; i++) {
                        let tempTrack = tempData.tracks[i];
                        await myDb.updateOrInsertData({ collection: 'tracks', query: { id: tempTrack.id }, args: { $set: { ...tempTrack, scanned_track: true } } });
                    }
                    let tempFill;
                    for (let i = 0; i < tempData.tracks.length; i++) {
                        tempFill = tempData.tracks[i];
                        await myDb.updateOrInsertData({ collection: 'playlist_tracks', args: { $set: { playlist_id: tempData.id, track_id: tempFill.id, track: tempFill } }, query: { playlist_id: tempData.id, track_id: tempFill.id } });
                    }
                    return true;
                });
            }
            return data;
        }).then(async (data) => {
            console.log('final queue state');
            console.log(queue);
            if (queue.length === 0) {
                let newUsers = await myDb.getData({ collection: 'users', args: { scanned_all: false }, options: { limit: 100, sort: sortUser } });
                newUsers.forEach(user => {
                    delete user._id;
                    delete user.id;
                    queue.push(user);
                });
            }
            console.log(`Update ${data.login} to be scanned_profile = true`);
            await wait(0).then(() => true);
            await myDb.updateOrInsertData({ collection: 'users', query: { login: `${data.login}` }, args: { $set: { scanned_all: true } } });
            return true;
        });
    }

})();

async function fetchAndSaveData({ url, user, pageCollection, queue = [{ default: true }], playlists = [] }) {
    let page = 1;
    let tempData, subData, fillData, pageData;
    let minDelayTimeMS = 2500, maxDelayTimeMS = 5000;
    let randMs = setRandMs(minDelayTimeMS, maxDelayTimeMS);
    let totalPages = 1;
    while (page != null && page <= totalPages && page !== -1) {
        await wait(randMs).then(async () => {
            if (!pageData || pageData === null) {
                //attempt to get last page searched for the collection
                pageData = await myDb.getData({ collection: pageCollection, args: { login: user } });
                if (pageData.length > 0) {
                    console.log(`Page data from ${pageCollection} for ${user}`);
                    console.log(pageData);
                    page = pageData[0].page;
                }
            }
            //we already searched this
            if (page === -1) return { exitThread: true };
            tempData = await myJsonh.getJson(`${url}&page=${page}`);
            if (tempData.status === false) return { dat, exitThread: true };
            switch (pageCollection) {
                case 'followers_searched':
                case 'following_searched':
                case 'user_favorite_tracks_searched':
                    if (tempData.pagination) {
                        pageData = tempData.pagination;
                        if (page === pageData.next_page) {
                            page += 1;
                        }
                        else page = pageData.next_page;
                        totalPages = pageData.total_pages;
                    }
                    break;
                case 'user_liked_playlists_searched':
                case 'user_mixes_searched':
                    if (tempData.mix_set.pagination) {
                        pageData = tempData.mix_set.pagination;
                        page = tempData.mix_set.pagination.next_page;
                        totalPages = pageData.total_pages;
                    }
                    break;
                case 'user_collections_searched':
                    page = null;
                    break;
                default:
                    break;
            }
            return tempData;
        }).then(async (dat) => {
            if (dat.exitThread) return dat;

            switch (pageCollection) {
                case 'followers_searched':
                    for (let i = 0; i < dat.users.length; i++) {
                        subData = dat.users[i];
                        let followerData = await setUserObject('users', { login: subData.login }, subData, defaultUserFields);
                        await myDb.updateOrInsertData({ collection: 'users', args: { $set: { ...followerData } }, query: { login: followerData.login } });
                        if (queue.length < 100) {
                            queue.push(followerData);
                        }
                        let query = { follower: dat.users[i]['login'], followee: user };
                        await myDb.updateOrInsertData({ collection: 'followers', args: { $set: { ...query } }, query });
                    }
                    break;
                case 'following_searched':
                    let tempPush;
                    for (let i = 0; i < dat.users.length; i++) {
                        subData = dat.users[i];
                        fillData = await setUserObject('users', { login: subData.login }, subData, defaultUserFields);
                        await myDb.updateOrInsertData({ collection: 'users', args: { $set: { ...fillData } }, query: { login: fillData.login } });
                        tempPush = await myDb.getData({ collection: 'users', args: { login: fillData.login } });
                        // if (queue.length < 100) {
                        //     queue.push(tempPush[0]);
                        // }
                        let query = { follower: dat.users[i]['login'], followee: user };
                        await myDb.updateOrInsertData({ collection: 'followers', args: { $set: { ...query } }, query });
                    }
                    break;
                case 'user_liked_playlists_searched':
                    for (let i = 0; i < dat.mix_set.mixes.length; i++) {
                        subData = dat.mix_set.mixes[i];
                        fillData = await setUserObject('playlists', { id: subData.id }, subData, { scanned_mix: false, scanned_tracks: false });
                        // playlists.push(fillData);
                        let newUser = await setUserObject('users', { login: subData.user.login }, { login: subData.user.login, path: subData.user.path }, defaultUserFields);
                        if (newUser.scanned_profile === false) {
                            if (queue.length < 100) { queue.push(newUser); }
                            await myDb.updateOrInsertData({ collection: 'users', query: { login: subData.user.login }, args: { $set: { ...newUser } } });
                        }
                        await myDb.updateOrInsertData({ collection: 'playlists', args: { $set: { ...fillData } }, query: { id: fillData.id } });
                        await myDb.updateOrInsertData({ collection: 'user_liked_playlists', args: { $set: { user_login: user, playlist_id: subData.id, playlist_name: subData.name } }, query: { user_login: user, playlist_id: subData.id } });
                    }
                    break;
                case 'user_mixes_searched':
                    for (let i = 0; i < dat.mix_set.mixes.length; i++) {
                        subData = dat.mix_set.mixes[i];
                        fillData = await setUserObject('playlists', { id: subData.id }, subData, { scanned_mix: false, scanned_tracks: false });
                        // playlists.push(fillData);
                        let newUser = await setUserObject('users', { login: subData.user.login }, { login: subData.user.login, path: subData.user.path }, defaultUserFields);
                        if (newUser.scanned_profile === false) {
                            if (queue.length < 100) { queue.push(newUser); }
                            await myDb.updateOrInsertData({ collection: 'users', query: { login: subData.user.login }, args: { $set: { ...newUser } } });
                        }
                        await myDb.updateOrInsertData({ collection: 'playlists', args: { $set: { ...fillData } }, query: { id: fillData.id } });
                        await myDb.updateOrInsertData({ collection: 'user_mixes_playlists', args: { $set: { user_login: subData.user.login, playlist_id: subData.id, playlist_name: subData.name } }, query: { user_login: subData.user.login, playlist_id: subData.id } });
                    }
                    break;
                case 'user_collections_searched':
                    let tempMix;
                    for (let i = 0; i < dat.collections.length; i++) {
                        fillData = dat.collections[i];
                        await myDb.updateOrInsertData({ collection: 'user_collections', args: { $set: { user_login: dat.user.login, ...fillData } }, query: { user_login: dat.user.login, id: fillData.id } });
                        for (let j = 0; j < fillData.mixes.length; j++) {
                            let query = { collection_id: fillData.id, mix_id: fillData.mixes[j].id };
                            await myDb.updateOrInsertData({ collection: 'collection_mixes', args: { $set: { ...query } }, query });
                            tempMix = await setUserObject('playlists', { id: fillData.mixes[j].id }, fillData.mixes[j], { scanned_mix: false, scanned_tracks: false });
                            // if (playlists.length <= 100) {
                            //     playlists.push(tempMix);
                            // }
                            await myDb.updateOrInsertData({ collection: 'playlists', args: { $set: { ...tempMix } }, query: { id: tempMix.id } });
                        }
                    }
                    break;
                case 'user_favorite_tracks_searched':
                    for (let i = 0; i < dat.favorite_tracks.length; i++) {
                        subData = dat.favorite_tracks[i];
                        await myDb.updateOrInsertData({ collection: 'user_favorite_tracks', args: { $set: { user_login: dat.user.login, ...subData } }, query: { user_login: dat.user.login, id: subData.id } });
                        let tempTrack = await setUserObject('tracks', { id: subData.id }, subData, { scanned_track: false });
                        await myDb.updateOrInsertData({ collection: 'tracks', args: { $set: { ...tempTrack } }, query: { id: tempTrack.id } });
                    }
                    break;
                case 'playlists_searched':
                case 'user_listened_searched':
                case 'user_listen_later_searched':
                default:
                    break;
            }
            let searchedPage = page !== null ? page - 1 : 1;
            await myDb.updateOrInsertData({ collection: pageCollection, query: { login: user }, args: { $set: { login: user, page: searchedPage } } });
            return true;
        });
        randMs = setRandMs(minDelayTimeMS, maxDelayTimeMS);
    }
    return;
}

function setRandMs(min = 500, max = 1000) {
    return Math.ceil(Math.random() * (max - min)) + min;
}

async function setUserObject(coll, query, userObj, defVals = Object.assign({}, defaultFields)) {
    let defaultedObj = Object.assign({}, defVals);
    defaultedObj = Object.assign(defaultedObj, userObj);
    let orig = await myDb.getData({ collection: coll, args: query });
    let newObj = Object.assign(defaultedObj, orig[0]);
    return newObj;
}

/*
BFS:
load 5 users from users table where scanned_profile === false and add to a queue
loop while the queue is not empty
current user = queue.shift()
get jsonh data from 8tracks and update users table with data
if scanned_followers === false, loop through all pages of followers and add to followers table and users table
if follower was not in users table, add follower to queue
change users record to have scanned_profile = true
if queue.length === 0 load next 5 users from users table where scanned_profile === false
*/

//find all followers:
//get all unscanned followers from users table
//get data for first user
//loop through pages of followers
//add each follower to followers table and add to users table

// db.collection_mixes.deleteMany({});
// db.followers.deleteMany({});
// db.followers_searched.deleteMany({});
// db.following_searched.deleteMany({});
// db.playlist_tracks.deleteMany({});
// db.playlists.deleteMany({});
// db.tracks.deleteMany({});
// db.user_collections.deleteMany({});
// db.user_collections_searched.deleteMany({});
// db.user_favorite_tracks.deleteMany({});
// db.user_favorite_tracks_searched.deleteMany({});
// db.user_liked_playlists.deleteMany({});
// db.user_liked_playlists_searched.deleteMany({});
// db.user_mixes_playlists.deleteMany({});
// db.user_mixes_searched.deleteMany({});
// db.users.deleteMany({});
