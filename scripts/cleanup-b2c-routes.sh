#!/usr/bin/env bash
set -e

echo "🧹 Cleaning up LMS/Classroom & Redundant Routes in PuuGoo/Vocabulary_Exam for B2C Global SaaS..."

# 1. Remove Classroom / Teacher Assignment features (LMS baggage)
rm -rf src/app/\(student\)/assignments
rm -rf src/app/admin/assignments src/app/admin/classes src/app/admin/results
rm -f src/components/AssignmentReminder.tsx src/components/FolderAccessManager.tsx

# 2. Remove duplicate review routes (Consolidated into /dashboard Smart SRS Queue)
rm -rf src/app/\(student\)/review \
       src/app/\(student\)/review-center \
       src/app/\(student\)/review-today \
       src/app/\(student\)/smart-review \
       src/app/\(student\)/mixed-practice \
       src/app/\(student\)/print-sets

# 3. Remove duplicate word storage routes (Consolidated into /library)
rm -rf src/app/\(student\)/my-words \
       src/app/\(student\)/vocabulary-vault \
       src/app/\(student\)/notebook \
       src/app/\(student\)/dictionary

# 4. Remove 12 fragmented study mode routes (Consolidated into 4-Stage LearnExperience in /study/[setId])
rm -rf src/app/\(student\)/cloze \
       src/app/\(student\)/collocation \
       src/app/\(student\)/dictation \
       src/app/\(student\)/listen \
       src/app/\(student\)/match \
       src/app/\(student\)/pattern \
       src/app/\(student\)/pronunciation \
       src/app/\(student\)/quiz \
       src/app/\(student\)/sentence \
       src/app/\(student\)/tone \
       src/app/\(student\)/feynman \
       src/app/\(student\)/writing

# 5. Remove duplicate progress routes (Consolidated into /analytics)
rm -rf src/app/\(student\)/history \
       src/app/\(student\)/weekly-report

echo "✅ Done! 32 student routes streamlined into 4 core B2C spaces: /dashboard, /library, /study/[setId], /analytics."
