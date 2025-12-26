import * as path from "path";

export class DebugInfoGenerator {
  private nextId: number = 1;
  private metadataNodes: Map<number, string> = new Map();
  private fileNodes: Map<string, number> = new Map(); // filePath -> node ID
  private subprograms: number[] = [];
  private compileUnitId: number = -1;
  private typeCache: Map<string, number> = new Map();
  private locationCache: Map<string, number> = new Map();

  constructor(
    private filename: string,
    private directory: string,
  ) {
    // Reserve ID 0 for later use if needed, start from 1?
    // Actually LLVM IR metadata can be numbered arbitrarily, but usually sequential.
    // We will generate them at the end or collect them.
  }

  public reset() {
    this.nextId = 1;
    this.metadataNodes.clear();
    this.fileNodes.clear();
    this.subprograms = [];
    this.compileUnitId = -1;
    this.typeCache.clear();
    this.locationCache.clear();
  }

  public getNextId(): number {
    return this.nextId++;
  }

  public addNode(content: string): number {
    const id = this.getNextId();
    this.metadataNodes.set(id, content);
    return id;
  }

  public getFileNodeId(filePath: string): number {
    if (this.fileNodes.has(filePath)) {
      return this.fileNodes.get(filePath)!;
    }

    // Create new DIFile node
    // !1 = !DIFile(filename: "main.bpl", directory: "/path/to/dir")
    const filename = path.basename(filePath);
    const directory = path.dirname(path.resolve(filePath));

    const content = `!DIFile(filename: "${filename}", directory: "${directory}", checksumkind: CSK_MD5, checksum: "00000000000000000000000000000000")`;
    const id = this.addNode(content);
    this.fileNodes.set(filePath, id);
    return id;
  }

  public createCompileUnit(
    // TODO: make it dynamic
    producer: string = "Debian clang version 21.1.6 (3)",
  ): number {
    // !0 = distinct !DICompileUnit(language: DW_LANG_C99, file: !1, producer: "BPL", isOptimized: false, runtimeVersion: 0, emissionKind: FullDebug, enums: !2)
    // We'll use DW_LANG_C99 (12) as a placeholder or similar.

    const fileId = this.getFileNodeId(this.filename);
    const enumsId = this.addNode("!{}"); // Empty enums list for now

    const content = `distinct !DICompileUnit(language: DW_LANG_C, file: !${fileId}, producer: "${producer}", isOptimized: false, runtimeVersion: 0, emissionKind: FullDebug, splitDebugInlining: false, nameTableKind: None)`;

    this.compileUnitId = this.addNode(content);
    return this.compileUnitId;
  }

  public createLocation(line: number, column: number, scopeId: number): number {
    const key = `${line}:${column}:${scopeId}`;
    if (this.locationCache.has(key)) {
      return this.locationCache.get(key)!;
    }

    // !10 = !DILocation(line: 1, column: 1, scope: !5)
    const content = `!DILocation(line: ${line}, column: ${column}, scope: !${scopeId})`;
    const id = this.addNode(content);
    this.locationCache.set(key, id);
    return id;
  }

  public createSubroutineType(
    returnTypeId: number,
    paramTypeIds: number[],
  ): number {
    // !6 = !DISubroutineType(types: !{!4, !4, !4})
    // types: !{returnType, arg1, arg2, ...}
    // If returnType is void (0), use null.

    const typesList = [returnTypeId, ...paramTypeIds];
    const typesStr = typesList
      .map((id) => (id === 0 ? "null" : `!${id}`))
      .join(", ");

    const content = `!DISubroutineType(types: !{${typesStr}})`;
    return this.addNode(content);
  }

  public createSubprogram(
    name: string,
    line: number,
    filePath: string,
    typeId: number,
  ): number {
    // !5 = distinct !DISubprogram(name: "main", scope: !1, file: !1, line: 1, type: !6, isLocal: false, isDefinition: true, scopeLine: 1, flags: DIFlagPrototyped, isOptimized: false, unit: !0, retainedNodes: !2)
    const fileId = this.getFileNodeId(filePath);
    const retainedNodesId = this.addNode("!{}");

    const content = `distinct !DISubprogram(name: "${name}", scope: !${fileId}, file: !${fileId}, line: ${line}, type: !${typeId}, scopeLine: ${line}, spFlags: DISPFlagDefinition, unit: !${this.compileUnitId})`;

    const id = this.addNode(content);
    this.subprograms.push(id);
    return id;
  }

  public createBasicType(
    name: string,
    sizeInBits: number,
    encoding: number,
  ): number {
    // !4 = !DIBasicType(name: "int", size: 32, encoding: DW_ATE_signed)
    const key = `basic:${name}:${encoding}`;
    if (this.typeCache.has(key)) return this.typeCache.get(key)!;

    const content = `!DIBasicType(name: "${name}", size: ${sizeInBits}, encoding: ${encoding})`;
    const id = this.addNode(content);
    this.typeCache.set(key, id);
    return id;
  }

  public createPointerType(pointeeTypeId: number): number {
    // !5 = !DIDerivedType(tag: DW_TAG_pointer_type, baseType: !4, size: 64)
    const key = `ptr:${pointeeTypeId}`;
    if (this.typeCache.has(key)) return this.typeCache.get(key)!;

    const baseType = pointeeTypeId === 0 ? "null" : `!${pointeeTypeId}`;
    const content = `!DIDerivedType(tag: DW_TAG_pointer_type, baseType: ${baseType}, size: 64)`;
    const id = this.addNode(content);
    this.typeCache.set(key, id);
    return id;
  }

  public createForwardDecl(
    tag: string,
    name: string,
    fileId: number,
    line: number,
  ): number {
    const key = `struct:${name}`;
    if (this.typeCache.has(key)) return this.typeCache.get(key)!;

    const content = `!DICompositeType(tag: ${tag}, name: "${name}", file: !${fileId}, line: ${line}, flags: DIFlagFwdDecl)`;
    const id = this.addNode(content);
    this.typeCache.set(key, id);
    return id;
  }

  public createStructType(
    name: string,
    sizeInBits: number,
    fileId: number,
    line: number,
    elements: number[],
    force: boolean = false,
  ): number {
    // !6 = !DICompositeType(tag: DW_TAG_structure_type, name: "Point", file: !1, line: 10, size: 128, elements: !7)
    const key = `struct:${name}`;
    if (!force && this.typeCache.has(key)) return this.typeCache.get(key)!;

    const elementsId = this.addNode(
      `!{${elements.map((e) => "!" + e).join(", ")}}`,
    );
    const content = `!DICompositeType(tag: DW_TAG_structure_type, name: "${name}", file: !${fileId}, line: ${line}, size: ${sizeInBits}, elements: !${elementsId})`;
    const id = this.addNode(content);
    this.typeCache.set(key, id);
    return id;
  }

  public createArrayType(
    size: number,
    elementTypeId: number,
    sizeInBits: number,
    alignInBits: number,
  ): number {
    // !10 = !DICompositeType(tag: DW_TAG_array_type, baseType: !4, size: 160, elements: !11)
    // !11 = !{!12}
    // !12 = !DISubrange(count: 5)

    const key = `array:${size}:${elementTypeId}`;
    if (this.typeCache.has(key)) return this.typeCache.get(key)!;

    const subrangeId = this.addNode(`!DISubrange(count: ${size})`);
    const elementsId = this.addNode(`!{!${subrangeId}}`);

    const baseType = elementTypeId === 0 ? "null" : `!${elementTypeId}`;
    const content = `!DICompositeType(tag: DW_TAG_array_type, baseType: ${baseType}, size: ${sizeInBits}, align: ${alignInBits}, elements: !${elementsId})`;

    const id = this.addNode(content);
    this.typeCache.set(key, id);
    return id;
  }

  public createMemberType(
    name: string,
    fileId: number,
    line: number,
    sizeInBits: number,
    offsetInBits: number,
    baseTypeId: number,
  ): number {
    // !8 = !DIDerivedType(tag: DW_TAG_member, name: "x", file: !1, line: 11, baseType: !4, size: 32, offset: 0)
    const baseType = baseTypeId === 0 ? "null" : `!${baseTypeId}`;
    const content = `!DIDerivedType(tag: DW_TAG_member, name: "${name}", file: !${fileId}, line: ${line}, baseType: ${baseType}, size: ${sizeInBits}, offset: ${offsetInBits})`;
    return this.addNode(content);
  }

  public createGlobalVariable(
    name: string,
    linkageName: string,
    fileId: number,
    line: number,
    typeId: number,
    isLocal: boolean,
    isDefinition: boolean,
  ): number {
    const type = typeId === 0 ? "null" : `!${typeId}`;
    // Use the file node as scope if available, otherwise compile unit
    const scopeId = this.compileUnitId;

    const varContent = `distinct !DIGlobalVariable(name: "${name}", linkageName: "${linkageName}", scope: !${scopeId}, file: !${fileId}, line: ${line}, type: ${type}, isLocal: ${isLocal}, isDefinition: ${isDefinition})`;
    const varId = this.addNode(varContent);

    const exprContent = `!DIGlobalVariableExpression(var: !${varId}, expr: !DIExpression())`;
    return this.addNode(exprContent);
  }

  public createAutoVariable(
    name: string,
    fileId: number,
    line: number,
    typeId: number,
    scopeId: number,
  ): number {
    // !12 = !DILocalVariable(name: "a", scope: !5, file: !1, line: 2, type: !4)
    const type = typeId === 0 ? "null" : `!${typeId}`;
    const content = `!DILocalVariable(name: "${name}", scope: !${scopeId}, file: !${fileId}, line: ${line}, type: ${type})`;
    return this.addNode(content);
  }

  public createParameterVariable(
    name: string,
    argIndex: number,
    fileId: number,
    line: number,
    typeId: number,
    scopeId: number,
  ): number {
    // !13 = !DILocalVariable(name: "p", arg: 1, scope: !5, file: !1, line: 1, type: !4)
    const type = typeId === 0 ? "null" : `!${typeId}`;
    const content = `!DILocalVariable(name: "${name}", arg: ${argIndex}, scope: !${scopeId}, file: !${fileId}, line: ${line}, type: ${type})`;
    return this.addNode(content);
  }

  public hasType(key: string): boolean {
    return this.typeCache.has(key);
  }

  public getType(key: string): number | undefined {
    return this.typeCache.get(key);
  }

  public generateMetadataOutput(): string[] {
    const output: string[] = [];

    // Emit named metadata
    if (this.compileUnitId !== -1) {
      output.push(`!llvm.dbg.cu = !{!${this.compileUnitId}}`);
    }

    // Module flags
    // !llvm.module.flags = !{!3, !4}
    // !3 = !{i32 2, !"Debug Info Version", i32 3}
    // !4 = !{i32 1, !"wchar_size", i32 4}

    const debugInfoVersionId = this.addNode(
      `!{i32 2, !"Debug Info Version", i32 3}`,
    );
    const wcharSizeId = this.addNode(`!{i32 1, !"wchar_size", i32 4}`);
    const dwarfVersionId = this.addNode(`!{i32 7, !"Dwarf Version", i32 5}`);
    const picLevelId = this.addNode(`!{i32 8, !"PIC Level", i32 2}`);
    const pieLevelId = this.addNode(`!{i32 7, !"PIE Level", i32 2}`);
    const uwtableId = this.addNode(`!{i32 7, !"uwtable", i32 2}`);
    const framePointerId = this.addNode(`!{i32 7, !"frame-pointer", i32 2}`);

    output.push(
      `!llvm.module.flags = !{!${debugInfoVersionId}, !${wcharSizeId}, !${dwarfVersionId}, !${picLevelId}, !${pieLevelId}, !${uwtableId}, !${framePointerId}}`,
    );

    const identId = this.addNode(`!{!"Debian clang version 21.1.6 (3)"}`);
    output.push(`!llvm.ident = !{!${identId}}`);

    // Emit all nodes
    // Sort by ID to be nice
    const sortedIds = Array.from(this.metadataNodes.keys()).sort(
      (a, b) => a - b,
    );
    for (const id of sortedIds) {
      output.push(`!${id} = ${this.metadataNodes.get(id)}`);
    }

    return output;
  }
}
