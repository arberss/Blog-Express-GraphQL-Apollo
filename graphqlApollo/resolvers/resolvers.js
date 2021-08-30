const userResolvers = require('./userRes');
const postResolvers = require('./postRes');

module.exports = {
    Query: {
        ...userResolvers.Query,
        ...postResolvers.Query
    },
    Mutation: {
        ...userResolvers.Mutation,
        ...postResolvers.Mutation
    }
}