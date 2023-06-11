import { NodeHandler, ASTParser } from "./base.js";
import { PropertyAssignmentType } from "./types.js";

export class PropertyAssignmentHandler extends NodeHandler {
  async accepts(node: ExpressionNode): Promise<PropertyAssignment | boolean> {
    if (ASTParser.isPropertyAssignment(node)) {
      return node;
    } else {
      return false;
    }
  }

  async handle(node: PropertyAssignment): Promise<PropertyAssignmentType> {
    if (!this.parentHandler) {
      throw new Error(
        "ArrayLiteralExpressionHandler must have a parent handler"
      );
    }
    let name;
    if (ASTParser.isIdentifier(node.key)) {
      name = node.key.name;
    } else if (ASTParser.isStringLiteral(node.key)) {
      name = node.key.value;
    } else {
      throw new Error("Invalid property key type");
    }
    if (!name) {
      throw new Error("Invalid property key");
    }
    const identifier = (`${name}` as string).replace(
      /^["'](.+(?=["']$))["']$/,
      "$1"
    );
    const value = await this.parentHandler.handle(node.value);
    return { type: "property_assignment", identifier, value };
  }
}
