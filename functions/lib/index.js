"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSlackNotification = exports.uploadPbGridFunction = exports.deleteUserAccountFunction = exports.processNewResultsAndRecalculate = exports.processAllResultsForPRs = exports.incrementalSyncFunction = exports.initialDataLoadFunction = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// Import and export all Cloud Functions (v2)
var initialDataLoad_1 = require("./initialDataLoad");
Object.defineProperty(exports, "initialDataLoadFunction", { enumerable: true, get: function () { return initialDataLoad_1.initialDataLoad; } });
var incrementalSync_1 = require("./incrementalSync");
Object.defineProperty(exports, "incrementalSyncFunction", { enumerable: true, get: function () { return incrementalSync_1.incrementalSync; } });
var processAllResultsForPRs_1 = require("./processAllResultsForPRs");
Object.defineProperty(exports, "processAllResultsForPRs", { enumerable: true, get: function () { return processAllResultsForPRs_1.processAllResultsForPRs; } });
var processNewResultsAndRecalculate_1 = require("./processNewResultsAndRecalculate");
Object.defineProperty(exports, "processNewResultsAndRecalculate", { enumerable: true, get: function () { return processNewResultsAndRecalculate_1.processNewResultsAndRecalculate; } });
var deleteUserAccount_1 = require("./deleteUserAccount");
Object.defineProperty(exports, "deleteUserAccountFunction", { enumerable: true, get: function () { return deleteUserAccount_1.deleteUserAccount; } });
var uploadPbGrid_1 = require("./uploadPbGrid");
Object.defineProperty(exports, "uploadPbGridFunction", { enumerable: true, get: function () { return uploadPbGrid_1.uploadPbGrid; } });
var sendSlackNotification_1 = require("./sendSlackNotification");
Object.defineProperty(exports, "sendSlackNotification", { enumerable: true, get: function () { return sendSlackNotification_1.sendSlackNotification; } });
//# sourceMappingURL=index.js.map