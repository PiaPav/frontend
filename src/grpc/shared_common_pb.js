/**
 * @fileoverview Generated Protocol Buffer code for common.proto
 * Сгенерировано вручную на основе proto/shared/common.proto
 */

/* eslint-disable */
// @ts-nocheck

import * as jspb from 'google-protobuf';

/**
 * enum ParseStatus
 * ВАЖНО: START (0) определён в proto, но бэкенд его НЕ отправляет
 * Реальная последовательность: REQUIREMENTS → ENDPOINTS → ARHITECTURE → DONE
 */
export const ParseStatus = {
  START: 0,           // Не используется бэкендом
  REQUIREMENTS: 1,    // Первый статус - список зависимостей
  ENDPOINTS: 2,       // Второй статус - словарь эндпоинтов
  ARHITECTURE: 3,     // Множество статусов - узлы графа (опечатка в proto)
  DONE: 4             // Финальный статус - завершение (parent="", children="" - заглушка)
};

/**
 * Message: GraphPartRequirements
 */
export class GraphPartRequirements extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, [2], null);
  }

  getTotal() {
    return jspb.Message.getFieldWithDefault(this, 1, 0);
  }

  setTotal(value) {
    return jspb.Message.setProto3IntField(this, 1, value);
  }

  getRequirementsList() {
    return jspb.Message.getRepeatedField(this, 2);
  }

  setRequirementsList(value) {
    return jspb.Message.setField(this, 2, value || []);
  }

  addRequirements(value, opt_index) {
    return jspb.Message.addToRepeatedField(this, 2, value, opt_index);
  }

  clearRequirementsList() {
    return this.setRequirementsList([]);
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    GraphPartRequirements.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new GraphPartRequirements();
    return GraphPartRequirements.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const total = message.getTotal();
    if (total !== 0) {
      writer.writeUint32(1, total);
    }
    const requirements = message.getRequirementsList();
    if (requirements.length > 0) {
      writer.writeRepeatedString(2, requirements);
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
          msg.setTotal(reader.readUint32());
          break;
        case 2:
          msg.addRequirements(reader.readString());
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}

/**
 * Message: GraphPartEndpoints
 */
export class GraphPartEndpoints extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, null, null);
  }

  getTotal() {
    return jspb.Message.getFieldWithDefault(this, 1, 0);
  }

  setTotal(value) {
    return jspb.Message.setProto3IntField(this, 1, value);
  }

  getEndpointsMap() {
    return jspb.Message.getMapField(this, 2, false, null);
  }

  clearEndpointsMap() {
    this.getEndpointsMap().clear();
    return this;
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    GraphPartEndpoints.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new GraphPartEndpoints();
    return GraphPartEndpoints.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const total = message.getTotal();
    if (total !== 0) {
      writer.writeUint32(1, total);
    }
    const endpoints = message.getEndpointsMap();
    if (endpoints && endpoints.getLength() > 0) {
      endpoints.serializeBinary(2, writer, jspb.BinaryWriter.prototype.writeString, jspb.BinaryWriter.prototype.writeString);
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
          msg.setTotal(reader.readUint32());
          break;
        case 2:
          const value = msg.getEndpointsMap();
          reader.readMessage(value, function(message, reader) {
            jspb.Map.deserializeBinary(message, reader, jspb.BinaryReader.prototype.readString, jspb.BinaryReader.prototype.readString, null, "", "");
          });
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}

/**
 * Message: GraphPartArchitecture
 */
export class GraphPartArchitecture extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, [2], null);
  }

  getParent() {
    return jspb.Message.getFieldWithDefault(this, 1, "");
  }

  setParent(value) {
    return jspb.Message.setProto3StringField(this, 1, value);
  }

  getChildrenList() {
    return jspb.Message.getRepeatedField(this, 2);
  }

  setChildrenList(value) {
    return jspb.Message.setField(this, 2, value || []);
  }

  addChildren(value, opt_index) {
    return jspb.Message.addToRepeatedField(this, 2, value, opt_index);
  }

  clearChildrenList() {
    return this.setChildrenList([]);
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    GraphPartArchitecture.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new GraphPartArchitecture();
    return GraphPartArchitecture.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const parent = message.getParent();
    if (parent.length > 0) {
      writer.writeString(1, parent);
    }
    const children = message.getChildrenList();
    if (children.length > 0) {
      writer.writeRepeatedString(2, children);
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
          msg.setParent(reader.readString());
          break;
        case 2:
          msg.addChildren(reader.readString());
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}

/**
 * Message: GraphPartResponse
 */
export class GraphPartResponse extends jspb.Message {
  constructor(opt_data) {
    super();
    jspb.Message.initialize(this, opt_data, 0, -1, null, GraphPartResponse.oneofGroups_);
  }

  static oneofGroups_ = [[4, 5, 6]];

  getTaskId() {
    return jspb.Message.getFieldWithDefault(this, 1, 0);
  }

  setTaskId(value) {
    return jspb.Message.setProto3IntField(this, 1, value);
  }

  getResponseId() {
    return jspb.Message.getFieldWithDefault(this, 2, 0);
  }

  setResponseId(value) {
    return jspb.Message.setProto3IntField(this, 2, value);
  }

  getStatus() {
    return jspb.Message.getFieldWithDefault(this, 3, 0);
  }

  setStatus(value) {
    return jspb.Message.setProto3EnumField(this, 3, value);
  }

  getGraphRequirements() {
    return jspb.Message.getWrapperField(this, GraphPartRequirements, 4);
  }

  setGraphRequirements(value) {
    return jspb.Message.setOneofWrapperField(this, 4, GraphPartResponse.oneofGroups_[0], value);
  }

  clearGraphRequirements() {
    return this.setGraphRequirements(undefined);
  }

  hasGraphRequirements() {
    return jspb.Message.getField(this, 4) != null;
  }

  getGraphEndpoints() {
    return jspb.Message.getWrapperField(this, GraphPartEndpoints, 5);
  }

  setGraphEndpoints(value) {
    return jspb.Message.setOneofWrapperField(this, 5, GraphPartResponse.oneofGroups_[0], value);
  }

  clearGraphEndpoints() {
    return this.setGraphEndpoints(undefined);
  }

  hasGraphEndpoints() {
    return jspb.Message.getField(this, 5) != null;
  }

  getGraphArchitecture() {
    return jspb.Message.getWrapperField(this, GraphPartArchitecture, 6);
  }

  setGraphArchitecture(value) {
    return jspb.Message.setOneofWrapperField(this, 6, GraphPartResponse.oneofGroups_[0], value);
  }

  clearGraphArchitecture() {
    return this.setGraphArchitecture(undefined);
  }

  hasGraphArchitecture() {
    return jspb.Message.getField(this, 6) != null;
  }

  getGraphPartTypeCase() {
    return jspb.Message.computeOneofCase(this, GraphPartResponse.oneofGroups_[0]);
  }

  serializeBinary() {
    const writer = new jspb.BinaryWriter();
    GraphPartResponse.serializeBinaryToWriter(this, writer);
    return writer.getResultBuffer();
  }

  static deserializeBinary(bytes) {
    const reader = new jspb.BinaryReader(bytes);
    const msg = new GraphPartResponse();
    return GraphPartResponse.deserializeBinaryFromReader(msg, reader);
  }

  static serializeBinaryToWriter(message, writer) {
    const taskId = message.getTaskId();
    if (taskId !== 0) {
      writer.writeInt64(1, taskId);
    }
    const responseId = message.getResponseId();
    if (responseId !== 0) {
      writer.writeInt32(2, responseId);
    }
    const status = message.getStatus();
    if (status !== 0) {
      writer.writeEnum(3, status);
    }
    const graphRequirements = message.getGraphRequirements();
    if (graphRequirements != null) {
      writer.writeMessage(4, graphRequirements, GraphPartRequirements.serializeBinaryToWriter);
    }
    const graphEndpoints = message.getGraphEndpoints();
    if (graphEndpoints != null) {
      writer.writeMessage(5, graphEndpoints, GraphPartEndpoints.serializeBinaryToWriter);
    }
    const graphArchitecture = message.getGraphArchitecture();
    if (graphArchitecture != null) {
      writer.writeMessage(6, graphArchitecture, GraphPartArchitecture.serializeBinaryToWriter);
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
          msg.setTaskId(reader.readInt64());
          break;
        case 2:
          msg.setResponseId(reader.readInt32());
          break;
        case 3:
          msg.setStatus(reader.readEnum());
          break;
        case 4:
          const req = new GraphPartRequirements();
          reader.readMessage(req, GraphPartRequirements.deserializeBinaryFromReader);
          msg.setGraphRequirements(req);
          break;
        case 5:
          const endp = new GraphPartEndpoints();
          reader.readMessage(endp, GraphPartEndpoints.deserializeBinaryFromReader);
          msg.setGraphEndpoints(endp);
          break;
        case 6:
          const arch = new GraphPartArchitecture();
          reader.readMessage(arch, GraphPartArchitecture.deserializeBinaryFromReader);
          msg.setGraphArchitecture(arch);
          break;
        default:
          reader.skipField();
          break;
      }
    }
    return msg;
  }
}
