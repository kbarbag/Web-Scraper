const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');


class DB {
    constructor() {
        // Connection URL
        const url = 'mongodb://localhost:27017';

        // Database Name
        this.dbName = 'webscrapper';
        this.client = new MongoClient(url);
        this.client.connect(function (err) {
            assert.equal(null, err);
            console.log("Connected successfully to server");
        });
    }

    async insertData({ collection, args, query }) {
        if (!collection || !args) return;
        this.db = this.client.db(this.dbName);
        const coll = this.db.collection(collection);
        let searchedData = await coll.find(query, { projection: { _id: 0 } }).toArray();
        if (searchedData.length === 0) {
            return await coll.insertOne(args, (err, result) => {
                if (!err) return result;
                console.log(err);
                return err;
            });
        }
        return;
    }

    async updateData({ collection, query, args }) {
        this.db = this.client.db(this.dbName);
        const coll = this.db.collection(collection);
        let searchedData = await coll.find(query, { projection: { _id: 0 } }).toArray();
        if (!searchedData || !searchedData.length) {
            delete args.$set._id;
            return await coll.insertOne(args.$set);
        }
        return await coll.updateOne(query, args);
    }

    async getData({ collection, args, options }) {
        this.db = this.client.db(this.dbName);
        const coll = this.db.collection(collection);
        return await coll.find(args, { ...options, projection: { _id: 0 } }).toArray();
    }

    closeClient() {
        this.client.close();
    }
}

module.exports = { DB };