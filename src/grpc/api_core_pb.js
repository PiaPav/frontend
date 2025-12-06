/**
 * @fileoverview Generated Protocol Buffer code for core.proto
 * Сгенерировано вручную на основе proto/api/core.proto
 */

/* eslint-disable */
// @ts-nocheck

import * as jspb from 'google-protobuf';

/**
 * Message: AlgorithmRequest
 */
export class AlgorithmRequest extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, null, null);
  }

  getUserId() {
    return jspb.Message.getFieldWithDefault(this, 1, 0);
  }

  setUserId(value) {
    return jspb.Message.setProto3IntField(this, 1, value);
  }

  getTaskId() {
    return jspb.Message.getFieldWithDefault(this, 2, 0);
  }

  setTaskId(value) {
    return jspb.Message.setProto3IntField(this, 2, value);
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    AlgorithmRequest.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new AlgorithmRequest();
    return AlgorithmRequest.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const userId = message.getUserId();
    if (userId !== 0) {
      writer.writeInt64(1, userId);
    }
    const taskId = message.getTaskId();
    if (taskId !== 0) {
      writer.writeInt64(2, taskId);
    }
  }

  static deserializeBinaryFromReader(msg, reader) {
    while (reader.nextField()) {
      if (reader.isEndGroup()) {
        break;
      }
      const field = reader.getFieldNumber();
      switch (field) {
        case 1:
          msg.setUserId(reader.readInt64());
          break;
        case 2:
          msg.setTaskId(reader.readInt64());
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}
