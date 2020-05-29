const axios = require('axios');
// const tunnel = require('tunnel');

class Jsonh {
    constructor() {
        this.url = 'https://8tracks.com';
    }

    async getJson(url) {
        console.log(url);
        return await axios({
            url, agent: {
                proxy: {
                    host: '144.91.116.171',
                    port: 443
                }
            }
        }).then(resp => {
            return resp.data;
        }).catch(err => {
            console.log('error in fetching data');
            throw err;
        });
    }
}

module.exports = { Jsonh };

//https://8tracks.com/mix_sets/liked:8565532/2?include=pagination,mixes[likes_count,user,length],details&format=jsonh
//https://8tracks.com/altqueen/mixes/3?include=pagination,mixes[likes_count,user,length],details&format=jsonh
//https://8tracks.com/salems-lot/mixes/2?include=pagination,mixes[likes_count,user,length],details&format=jsonh
//https://8tracks.com/users/basile/liked_mixes?format=jsonh
//https://8tracks.com/users/altqueen/followers.jsonh
//https://8tracks.com/users/altqueen/following.jsonh
//https://8tracks.com/altqueen/mixes.jsonh
//https://8tracks.com/users/altqueen/liked_mixes.jsonh
//https://8tracks.com/users/altqueen/collections.jsonh
//https://8tracks.com/users/altqueen.jsonh
//https://8tracks.com/mix_sets/listened:3693390
//https://8tracks.com/altqueen/collections/listen-later
//https://8tracks.com/mixes/${mix.id}/tracks_for_international.jsonh