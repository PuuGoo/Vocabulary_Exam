import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { canonicalizePinyinDisplay } from "@/lib/pinyin";
import { createWordSense, listWordSenses } from "@/lib/wordSenses";

const schema=z.object({pronunciation:z.string().trim().max(256).nullable().optional(),meaning:z.string().trim().min(1),example:z.string().trim().nullable().optional(),examplePronunciation:z.string().trim().nullable().optional(),exampleMeaning:z.string().trim().nullable().optional(),wtype:z.string().trim().max(32).nullable().optional(),isPrimary:z.boolean().optional()});
async function resource(wordId:number){return (await db.select({wordId:words.id,folderId:vocabSets.folderId}).from(words).innerJoin(vocabSets,eq(vocabSets.id,words.setId)).where(eq(words.id,wordId)).limit(1))[0];}
export async function GET(_req:NextRequest,{params}:{params:{id:string}}){const access=await requireAdminPermission("vocab.view");if(isAuthorizationError(access))return access;const row=await resource(Number(params.id));if(!row)return NextResponse.json({error:"Not found"},{status:404});const scoped=await requireAdminResourceAccess({permission:"vocab.view",folderId:row.folderId,level:"viewer",access});if(isAuthorizationError(scoped))return scoped;return NextResponse.json({senses:await listWordSenses(row.wordId)});}
export async function POST(req:NextRequest,{params}:{params:{id:string}}){const access=await requireAdminPermission("vocab.edit");if(isAuthorizationError(access))return access;const row=await resource(Number(params.id));if(!row)return NextResponse.json({error:"Not found"},{status:404});const scoped=await requireAdminResourceAccess({permission:"vocab.edit",folderId:row.folderId,level:"editor",access});if(isAuthorizationError(scoped))return scoped;const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Dữ liệu cách đọc không hợp lệ."},{status:400});const sense=await createWordSense(row.wordId,{...parsed.data,pronunciation:parsed.data.pronunciation?canonicalizePinyinDisplay(parsed.data.pronunciation):null});return NextResponse.json({sense},{status:201});}
